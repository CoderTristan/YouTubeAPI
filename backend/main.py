from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from urllib.parse import urlencode
from dotenv import load_dotenv
from datetime import datetime
from sqlalchemy import select
from analytics import AnalyticsEngine
import requests
import os

from database import get_db
from models import UserToken, AnalyticsSnapshot

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = "http://localhost:8000/auth/callback"

SCOPES = (
    "https://www.googleapis.com/auth/yt-analytics.readonly "
    "https://www.googleapis.com/auth/youtube.readonly"
)


# --------------------------------------------------
# SAVE SNAPSHOT HELPER
# --------------------------------------------------

async def save_snapshot(db, user_id, endpoint, data):
    snapshot = AnalyticsSnapshot(
        user_id=user_id,
        endpoint=endpoint,
        snapshot=data
    )
    db.add(snapshot)
    await db.commit()


# --------------------------------------------------
# AUTH
# --------------------------------------------------

@app.get("/auth/login")
async def login(user_id: str = "default"):
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": user_id,
    }

    return {
        "auth_url":
            "https://accounts.google.com/o/oauth2/v2/auth?"
            + urlencode(params)
    }


@app.get("/auth/callback")
async def callback(code: str, state: str = "default", db=Depends(get_db)):
    token_url = "https://oauth2.googleapis.com/token"

    response = requests.post(
        token_url,
        data={
            "code": code,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
    )

    tokens = response.json()

    if "access_token" not in tokens:
        raise HTTPException(status_code=400, detail=tokens)

    # Check if user exists
    result = await db.execute(select(UserToken).where(UserToken.user_id == state))
    existing = result.scalar_one_or_none()

    # Keep old refresh token if Google doesn't send a new one
    if existing and "refresh_token" not in tokens:
        tokens["refresh_token"] = existing.refresh_token

    # Save to DB
    if existing:
        existing.access_token = tokens["access_token"]
        existing.refresh_token = tokens.get("refresh_token")
        existing.token_data = tokens
    else:
        new_user = UserToken(
            user_id=state,
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            token_data=tokens,
        )
        db.add(new_user)

    await db.commit()

    return RedirectResponse(f"http://localhost:5173/?auth=ok&user={state}")


def refresh_token(refresh_token_value):
    response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "refresh_token": refresh_token_value,
            "grant_type": "refresh_token",
        },
    )
    return response.json()


async def authorized_request(user_id, url, params=None, db=None):
    result = await db.execute(select(UserToken).where(UserToken.user_id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not authenticated")

    headers = {"Authorization": f"Bearer {user.access_token}"}

    response = requests.get(url, headers=headers, params=params)

    # Token expired → refresh
    if response.status_code == 401 and user.refresh_token:
        new_tokens = refresh_token(user.refresh_token)

        if "access_token" in new_tokens:
            user.access_token = new_tokens["access_token"]
            await db.commit()

            headers["Authorization"] = f"Bearer {new_tokens['access_token']}"
            response = requests.get(url, headers=headers, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    return response.json()


def analytics_dates():
    year = datetime.now().year
    return (
        f"{year}-01-01",
        datetime.now().strftime("%Y-%m-%d")
    )


# --------------------------------------------------
# VIDEOS
# --------------------------------------------------

@app.get("/youtube/videos")
async def videos(user_id: str = "default", db=Depends(get_db)):

    channel = await authorized_request(
        user_id,
        "https://www.googleapis.com/youtube/v3/channels",
        {"part": "contentDetails", "mine": "true"},
        db=db
    )

    uploads_playlist = (
        channel["items"][0]
        ["contentDetails"]
        ["relatedPlaylists"]
        ["uploads"]
    )

    data = await authorized_request(
        user_id,
        "https://www.googleapis.com/youtube/v3/playlistItems",
        {
            "part": "snippet",
            "playlistId": uploads_playlist,
            "maxResults": 50,
        },
        db=db
    )

    await save_snapshot(db, user_id, "videos", data)
    return data


# --------------------------------------------------
# CHANNEL ANALYTICS
# --------------------------------------------------

@app.get("/youtube/analytics")
async def analytics(user_id: str = "default", db=Depends(get_db)):

    start_date, end_date = analytics_dates()

    data = await authorized_request(
        user_id,
        "https://youtubeanalytics.googleapis.com/v2/reports",
        {
            "ids": "channel==MINE",
            "startDate": start_date,
            "endDate": end_date,
            "metrics":
                "views,likes,comments,estimatedMinutesWatched,"
                "averageViewDuration,averageViewPercentage,"
                "subscribersGained,subscribersLost",
            "dimensions": "day",
            "sort": "day",
        },
        db=db
    )

    await save_snapshot(db, user_id, "channel_daily", data)
    return data


# --------------------------------------------------
# VIDEO ANALYTICS
# --------------------------------------------------

@app.get("/youtube/analytics/videos")
async def analytics_videos(user_id: str = "default", db=Depends(get_db)):

    start_date, end_date = analytics_dates()

    data = await authorized_request(
        user_id,
        "https://youtubeanalytics.googleapis.com/v2/reports",
        {
            "ids": "channel==MINE",
            "startDate": start_date,
            "endDate": end_date,
            "metrics":
                "views,likes,comments,estimatedMinutesWatched,"
                "averageViewDuration,averageViewPercentage,"
                "subscribersGained",
            "dimensions": "video",
            "sort": "-views",
            "maxResults": 200,
        },
        db=db
    )

    await save_snapshot(db, user_id, "video_analytics", data)
    return data


# --------------------------------------------------
# TRAFFIC
# --------------------------------------------------

@app.get("/youtube/analytics/traffic")
async def traffic(user_id: str = "default", db=Depends(get_db)):

    start_date, end_date = analytics_dates()

    data = await authorized_request(
        user_id,
        "https://youtubeanalytics.googleapis.com/v2/reports",
        {
            "ids": "channel==MINE",
            "startDate": start_date,
            "endDate": end_date,
            "metrics": "views",
            "dimensions": "insightTrafficSourceType",
            "sort": "-views",
        },
        db=db
    )

    await save_snapshot(db, user_id, "traffic", data)
    return data


# --------------------------------------------------
# GEO
# --------------------------------------------------

@app.get("/youtube/analytics/geo")
async def geo(user_id: str = "default", db=Depends(get_db)):

    start_date, end_date = analytics_dates()

    data = await authorized_request(
        user_id,
        "https://youtubeanalytics.googleapis.com/v2/reports",
        {
            "ids": "channel==MINE",
            "startDate": start_date,
            "endDate": end_date,
            "metrics": "views",
            "dimensions": "country",
            "sort": "-views",
        },
        db=db
    )

    await save_snapshot(db, user_id, "geo", data)
    return data


# --------------------------------------------------
# DEVICES
# --------------------------------------------------

@app.get("/youtube/analytics/devices")
async def devices(user_id: str = "default", db=Depends(get_db)):

    start_date, end_date = analytics_dates()

    data = await authorized_request(
        user_id,
        "https://youtubeanalytics.googleapis.com/v2/reports",
        {
            "ids": "channel==MINE",
            "startDate": start_date,
            "endDate": end_date,
            "metrics": "views",
            "dimensions": "deviceType",
            "sort": "-views",
        },
        db=db
    )

    await save_snapshot(db, user_id, "devices", data)
    return data


@app.get("/analytics/history")
async def get_all_history(user_id: str = "default", db=Depends(get_db)):
    result = await db.execute(
        select(AnalyticsSnapshot)
        .where(AnalyticsSnapshot.user_id == user_id)
        .order_by(AnalyticsSnapshot.created_at.desc())
    )
    rows = result.scalars().all()
    return [r.snapshot for r in rows]


@app.get("/analytics/history/{endpoint}")
async def get_history(endpoint: str, user_id: str = "default", db=Depends(get_db)):
    result = await db.execute(
        select(AnalyticsSnapshot)
        .where(AnalyticsSnapshot.user_id == user_id)
        .where(AnalyticsSnapshot.endpoint == endpoint)
        .order_by(AnalyticsSnapshot.created_at.desc())
    )
    rows = result.scalars().all()
    return [r.snapshot for r in rows]


@app.get("/analytics/dashboard")
async def analytics_dashboard(user_id: str = "default", db=Depends(get_db)):

    videos_data = await analytics_videos(user_id=user_id, db=db)


    rows = videos_data.get("rows", [])

    if not rows:
        return {
            "channelHealth": 0,
            "videos": []
        }

    videos = []

    for row in rows:

        videos.append({
            "video_id": row[0],
            "views": float(row[1] or 0),
            "likes": float(row[2] or 0),
            "comments": float(row[3] or 0),
            "estimatedMinutesWatched": float(row[4] or 0),
            "averageViewDuration": float(row[5] or 0),
            "averageViewPercentage": float(row[6] or 0),
            "subscribersGained": float(row[7] or 0),
        })

    avg_views = (
        sum(v["views"] for v in videos)
        / len(videos)
    )

    avg_retention = (
        sum(v["averageViewPercentage"] for v in videos)
        / len(videos)
    )

    avg_engagement = (
        sum(
            AnalyticsEngine.engagement_rate(
                v["views"],
                v["likes"],
                v["comments"]
            )
            for v in videos
        )
        / len(videos)
    )

    avg_sub_conversion = (
        sum(
            AnalyticsEngine.subscriber_conversion(
                v["views"],
                v["subscribersGained"]
            )
            for v in videos
        )
        / len(videos)
    )

    insight_videos = []

    for video in videos:

        engagement = AnalyticsEngine.engagement_rate(
            video["views"],
            video["likes"],
            video["comments"]
        )

        sub_conversion = (
            AnalyticsEngine.subscriber_conversion(
                video["views"],
                video["subscribersGained"]
            )
        )

        relative_views = (
            AnalyticsEngine.relative_score(
                video["views"],
                avg_views
            )
        )

        relative_retention = (
            AnalyticsEngine.relative_score(
                video["averageViewPercentage"],
                avg_retention
            )
        )

        relative_engagement = (
            AnalyticsEngine.relative_score(
                engagement,
                avg_engagement
            )
        )

        relative_subscribers = (
            AnalyticsEngine.relative_score(
                sub_conversion,
                avg_sub_conversion
            )
        )

        health_score = (
            AnalyticsEngine.video_health_score(
                relative_views,
                relative_retention,
                relative_engagement,
                relative_subscribers
            )
        )

        viral_probability = (
            AnalyticsEngine.viral_probability(
                relative_views,
                relative_retention,
                relative_engagement
            )
        )

        insight_videos.append({
            "video_id": video["video_id"],
            "healthScore": health_score,
            "viralProbability": viral_probability,
            "relativeViews": round(relative_views, 2),
            "relativeRetention": round(relative_retention, 2),
            "relativeEngagement": round(relative_engagement, 2),
            "relativeSubscribers": round(relative_subscribers, 2),
        })

    channel_health = AnalyticsEngine.channel_health(
        avg_retention,
        avg_engagement,
        0.10,
        avg_sub_conversion
    )

    return {
        "channelHealth": channel_health,
        "averageViews": round(avg_views),
        "averageRetention": round(avg_retention, 2),
        "averageEngagement": round(avg_engagement, 4),
        "videos": insight_videos,
    }