import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

import "./App.css";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

type AnyObj = Record<string, any>;

function formatNumber(value: any) {
  if (value == null) return "—";

  const num = Number(value);

  if (Number.isNaN(num)) {
    return String(value);
  }

  return num.toLocaleString();
}

export default function Dashboard({
  userId,
}: {
  userId: string;
}) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [videos, setVideos] = useState<any>(null);
  const [analyticsVideos, setAnalyticsVideos] =
    useState<any>(null);
  const [traffic, setTraffic] = useState<any>(null);
  const [geo, setGeo] = useState<any>(null);
  const [devices, setDevices] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    null
  );

  const getJson = async (url: string) => {
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `${response.status} ${response.statusText}\n${text}`
      );
    }

    return response.json();
  };

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      getJson(
        `http://localhost:8000/youtube/analytics?user_id=${userId}`
      ),
      getJson(
        `http://localhost:8000/youtube/videos?user_id=${userId}`
      ),
      getJson(
        `http://localhost:8000/youtube/analytics/videos?user_id=${userId}`
      ),
      getJson(
        `http://localhost:8000/youtube/analytics/traffic?user_id=${userId}`
      ),
      getJson(
        `http://localhost:8000/youtube/analytics/geo?user_id=${userId}`
      ),
      getJson(
        `http://localhost:8000/youtube/analytics/devices?user_id=${userId}`
      ),
    ])
      .then(([a, v, av, t, g, d]) => {
        console.log("analytics", a);
        console.log("videos", v);
        console.log("analyticsVideos", av);

        setAnalytics(a);
        setVideos(v);
        setAnalyticsVideos(av);
        setTraffic(t);
        setGeo(g);
        setDevices(d);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  const perVideoMap = useMemo(() => {
    const rows = analyticsVideos?.rows ?? [];

    const map: Record<string, AnyObj> = {};

    for (const row of rows) {
      const videoId = row[0];

      map[videoId] = {
        views: Number(row[1] ?? 0),
        likes: Number(row[2] ?? 0),
        comments: Number(row[3] ?? 0),
        estimatedMinutesWatched: Number(
          row[4] ?? 0
        ),
        averageViewDuration: Number(
          row[5] ?? 0
        ),
        averageViewPercentage: Number(
          row[6] ?? 0
        ),
        subscribersGained: Number(
          row[7] ?? 0
        ),
      };
    }

    return map;
  }, [analyticsVideos]);

  const chartData = useMemo(() => {
    const rows = analytics?.rows ?? [];

    return {
      labels: rows.map((r: any) => r[0]),

      datasets: [
        {
          label: "Views",
          data: rows.map((r: any) =>
            Number(r[1] ?? 0)
          ),

          borderColor: "#6366f1",
          backgroundColor:
            "rgba(99,102,241,0.2)",

          tension: 0.35,
        },
      ],
    };
  }, [analytics]);

  const chartOptions = {
    responsive: true,

    plugins: {
      legend: {
        labels: {
          color: "#ffffff",
        },
      },
    },

    scales: {
      x: {
        ticks: {
          color: "#d1d5db",
        },
      },

      y: {
        ticks: {
          color: "#d1d5db",
        },
      },
    },
  };

  const videoCards = useMemo(() => {
    const items = videos?.items ?? [];

    return items.map((item: any) => {
      const videoId =
        item.snippet.resourceId.videoId;

      return {
        videoId,
        meta: item.snippet,
        stats: perVideoMap[videoId] ?? {},
      };
    });
  }, [videos, perVideoMap]);

  const maxViews = useMemo(() => {
    const values = Object.values(
      perVideoMap
    ).map((v: any) => v.views || 0);

    return Math.max(
      ...(values.length ? values : [1])
    );
  }, [perVideoMap]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-red-400 p-8">
        <h2 className="text-2xl font-bold mb-4">
          Backend Error
        </h2>

        <pre className="whitespace-pre-wrap bg-gray-800 p-4 rounded">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold">
            YouTube Analytics
          </h1>

          <p className="text-gray-400 mt-2">
            User: {userId}
          </p>
        </header>

        <section className="bg-gray-800 p-6 rounded-xl mb-8">
          <h2 className="text-xl font-semibold mb-4">
            Channel Performance
          </h2>

          <Line
            data={chartData}
            options={chartOptions}
          />
        </section>

        <section className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-4">
              Traffic Sources
            </h3>

            <ul className="space-y-2">
              {(traffic?.rows ?? []).map(
                (row: any, index: number) => (
                  <li
                    key={index}
                    className="flex justify-between"
                  >
                    <span>{row[0]}</span>
                    <span>
                      {formatNumber(row[1])}
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>

          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-4">
              Top Countries
            </h3>

            <ul className="space-y-2">
              {(geo?.rows ?? []).map(
                (row: any, index: number) => (
                  <li
                    key={index}
                    className="flex justify-between"
                  >
                    <span>{row[0]}</span>
                    <span>
                      {formatNumber(row[1])}
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>

          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-4">
              Device Types
            </h3>

            <ul className="space-y-2">
              {(devices?.rows ?? []).map(
                (row: any, index: number) => (
                  <li
                    key={index}
                    className="flex justify-between"
                  >
                    <span>{row[0]}</span>
                    <span>
                      {formatNumber(row[1])}
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">
            Top Videos
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videoCards.map((video) => {
              const stats = video.stats;
              const meta = video.meta;

              const percent =
                maxViews > 0
                  ? Math.round(
                      ((stats.views || 0) /
                        maxViews) *
                        100
                    )
                  : 0;

              return (
                <div
                  key={video.videoId}
                  className="bg-gray-800 rounded-xl p-4"
                >
                  <img
                    src={
                      meta.thumbnails?.medium?.url
                    }
                    alt={meta.title}
                    className="rounded-lg mb-3 w-full h-40 object-cover"
                  />

                  <h3 className="font-semibold line-clamp-2">
                    {meta.title}
                  </h3>

                  <p className="text-gray-400 text-sm mb-4">
                    {new Date(
                      meta.publishedAt
                    ).toLocaleDateString()}
                  </p>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Views</span>
                      <span>
                        {formatNumber(
                          stats.views
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Likes</span>
                      <span>
                        {formatNumber(
                          stats.likes
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Comments</span>
                      <span>
                        {formatNumber(
                          stats.comments
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Avg View %</span>
                      <span>
                        {stats.averageViewPercentage
                          ? `${stats.averageViewPercentage.toFixed(
                              1
                            )}%`
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="h-2 bg-gray-700 rounded">
                      <div
                        className="h-2 bg-indigo-500 rounded"
                        style={{
                          width: `${percent}%`,
                        }}
                      />
                    </div>

                    <div className="text-xs text-gray-400 mt-1">
                      {percent}% of top video
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}