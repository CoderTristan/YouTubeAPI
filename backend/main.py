from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from urllib.parse import urlencode
import requests
import os
from datetime import datetime

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

SCOPES = "https://www.googleapis.com/auth/yt-analytics.readonly"

USER_TOKENS = {}

@app.get("/auth/login")
def login(user_id: str = "default"):
    # Pass user_id into the 'state' parameter so Google sends it back to us
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": user_id  
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"auth_url": url}

@app.get("/auth/callback")
def callback(code: str, state: str = "default"):
    # Google returns the 'user_id' inside the 'state' parameter
    user_id = state 
    token_url = "https://oauth2.googleapis.com/token"

    data = {
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }

    r = requests.post(token_url, data=data)
    tokens = r.json()

    if "access_token" not in tokens:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {tokens}")

    if user_id in USER_TOKENS and "refresh_token" not in tokens:
        tokens["refresh_token"] = USER_TOKENS[user_id].get("refresh_token")

    USER_TOKENS[user_id] = tokens
    return {"status": "ok", "tokens_saved_for": user_id}


def refresh_token_func(refresh_token):
    url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }
    return requests.post(url, data=data).json()


@app.get("/youtube/analytics")
def analytics(user_id: str = "default"):
    if user_id not in USER_TOKENS:
        raise HTTPException(status_code=401, detail="User not authenticated")

    tokens = USER_TOKENS[user_id]
    access_token = tokens["access_token"]

    headers = {"Authorization": f"Bearer {access_token}"}

    # Dynamically getting current year data instead of hardcoded 2023
    current_year = datetime.now().year
    params = {
        "ids": "channel==MINE",
        "startDate": f"{current_year}-01-01",
        "endDate": f"{current_year}-12-31",
        "metrics": "views,likes,subscribersGained",
        "dimensions": "day",
        "sort": "day"
    }

    r = requests.get(
        "https://youtubeanalytics.googleapis.com/v2/reports",
        headers=headers,
        params=params
    )

    # If expired, refresh and try again
    if r.status_code == 401 and "refresh_token" in tokens:
        new_tokens = refresh_token_func(tokens["refresh_token"])
        
        if "access_token" in new_tokens:
            USER_TOKENS[user_id]["access_token"] = new_tokens["access_token"]
            headers = {"Authorization": f"Bearer {new_tokens['access_token']}"}
            
            # Re-assign 'r' so the new valid response is returned
            r = requests.get(
                "https://youtubeanalytics.googleapis.com/v2/reports",
                headers=headers,
                params=params
            )

    return r.json()