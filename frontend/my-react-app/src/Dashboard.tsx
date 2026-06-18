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
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString();
}

export default function Dashboard({ userId }: { userId: string }) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [videos, setVideos] = useState<any>(null);
  const [analyticsVideos, setAnalyticsVideos] = useState<any>(null);
  const [traffic, setTraffic] = useState<any>(null);
  const [geo, setGeo] = useState<any>(null);
  const [devices, setDevices] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMetric, setFilterMetric] = useState("views");
  const [filterType, setFilterType] = useState("all");

  const getJson = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}\n${text}`);
    }
    return response.json();
  };

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      getJson(`http://localhost:8000/youtube/analytics?user_id=${userId}`),
      getJson(`http://localhost:8000/youtube/videos?user_id=${userId}`),
      getJson(`http://localhost:8000/youtube/analytics/videos?user_id=${userId}`),
      getJson(`http://localhost:8000/youtube/analytics/traffic?user_id=${userId}`),
      getJson(`http://localhost:8000/youtube/analytics/geo?user_id=${userId}`),
      getJson(`http://localhost:8000/youtube/analytics/devices?user_id=${userId}`),
      getJson(`http://localhost:8000/analytics/dashboard?user_id=${userId}`),
    ])
      .then(([a, v, av, t, g, d, i]) => {
        setAnalytics(a);
        setVideos(v);
        setAnalyticsVideos(av);
        setTraffic(t);
        setGeo(g);
        setDevices(d);
        setInsights(i);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
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
        estimatedMinutesWatched: Number(row[4] ?? 0),
        averageViewDuration: Number(row[5] ?? 0),
        averageViewPercentage: Number(row[6] ?? 0),
        subscribersGained: Number(row[7] ?? 0),
      };
    }

    return map;
  }, [analyticsVideos]);

  const insightMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const v of insights?.videos ?? []) {
      const id = v.video_id || v.videoId;
      if (id) {
        map[id] = v;
      }
    }
    return map;
  }, [insights]);

  const chartData = useMemo(() => {
    const rows = analytics?.rows ?? [];
    return {
      labels: rows.map((r: any) => r[0]),
      datasets: [
        {
          label: "Views",
          data: rows.map((r: any) => Number(r[1] ?? 0)),
          borderColor: "#6366f1",
          backgroundColor: "rgba(99,102,241,0.2)",
          tension: 0.35,
        },
      ],
    };
  }, [analytics]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#ffffff" },
      },
    },
    scales: {
      x: { ticks: { color: "#d1d5db" } },
      y: { ticks: { color: "#d1d5db" } },
    },
  };

  const videoCards = useMemo(() => {
    const items = videos?.items ?? [];
    return items.map((item: any) => {
      const videoId = item.snippet?.resourceId?.videoId || item.id || item.videoId;
      const meta = item.snippet ?? {};
      const insight = insightMap[videoId] ?? {};
      const stats = perVideoMap[videoId] ?? {};
      
      // Multi-layered Shorts scanner looking at metadata and potential backend flags
      const isShort =
        item.isShort === true ||
        item.is_short === true ||
        item.videoType?.toLowerCase() === "short" ||
        item.video_type?.toLowerCase() === "short" ||
        insight.isShort === true ||
        insight.is_short === true ||
        insight.videoType?.toLowerCase() === "short" ||
        insight.video_type?.toLowerCase() === "short" ||
        meta.title?.toLowerCase().includes("shorts") ||
        meta.description?.toLowerCase().includes("#shorts") ||
        (meta.tags && meta.tags.some((t: string) => t.toLowerCase().includes("short")));
        
      return {
        videoId,
        meta,
        stats,
        insight,
        isShort,
      };
    });
  }, [videos, perVideoMap, insightMap]);

  const maxViews = useMemo(() => {
    const values = Object.values(perVideoMap).map((v: any) => v.views || 0);
    return Math.max(...(values.length ? values : [1]));
  }, [perVideoMap]);

  const getMetricValue = (video: any, metric: string) => {
    if (video.stats && video.stats[metric] !== undefined) {
      return Number(video.stats[metric]);
    }
    if (video.insight && video.insight[metric] !== undefined) {
      return Number(video.insight[metric]);
    }
    const snakeMetric = metric.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (video.insight && video.insight[snakeMetric] !== undefined) {
      return Number(video.insight[snakeMetric]);
    }
    return 0;
  };

  const filteredVideos = useMemo(() => {
    if (!videoCards.length) return [];

    let items = videoCards.filter((v) => {
      if (filterType === "videos") return !v.isShort;
      if (filterType === "shorts") return v.isShort;
      return true;
    });

    items.sort((a, b) => {
      const aVal = getMetricValue(a, filterMetric);
      const bVal = getMetricValue(b, filterMetric);
      return bVal - aVal;
    });

    return items;
  }, [videoCards, filterMetric, filterType]);

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
        <h2 className="text-2xl font-bold mb-4">Backend Error</h2>
        <pre className="whitespace-pre-wrap bg-gray-800 p-4 rounded">{error}</pre>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="w-full mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold">YouTube Analytics</h1>
          <p className="text-gray-400 mt-2">User: {userId}</p>
        </header>

        {/* INSIGHTS SUMMARY */}
        <section className="grid md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-xl">
            <div className="text-gray-400 text-sm">Channel Health</div>
            <div className="text-4xl font-bold">{insights?.channelHealth ?? "—"}</div>
          </div>

          <div className="bg-gray-800 p-4 rounded-xl">
            <div className="text-gray-400 text-sm">Avg Views</div>
            <div className="text-4xl font-bold">{formatNumber(insights?.averageViews)}</div>
          </div>

          <div className="bg-gray-800 p-4 rounded-xl">
            <div className="text-gray-400 text-sm">Avg Retention</div>
            <div className="text-4xl font-bold">{insights?.averageRetention}%</div>
          </div>

          <div className="bg-gray-800 p-4 rounded-xl">
            <div className="text-gray-400 text-sm">Avg Engagement</div>
            <div className="text-4xl font-bold">{insights?.averageEngagement}</div>
          </div>
        </section>

        {/* CHANNEL PERFORMANCE CHART */}
        <section className="bg-gray-800 p-6 rounded-xl mb-8 w-full">
          <h2 className="text-xl font-semibold mb-4">Channel Performance</h2>
          <div className="h-96">
            <Line data={chartData} options={chartOptions} />
          </div>
        </section>

        {/* TRAFFIC / GEO / DEVICES */}
        <section className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-xl p-4 flex flex-col">
            <h3 className="font-semibold mb-4">Traffic Sources</h3>
            <div className="h-48 overflow-y-auto pr-1 custom-scrollbar">
              <ul className="space-y-2">
                {(traffic?.rows ?? []).map((row: any, index: number) => (
                  <li key={index} className="flex justify-between">
                    <span className="text-gray-300">{row[0]}</span>
                    <span className="font-medium">{formatNumber(row[1])}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 flex flex-col">
            <h3 className="font-semibold mb-4">Top Countries</h3>
            <div className="h-48 overflow-y-auto pr-1 custom-scrollbar">
              <ul className="space-y-2">
                {(geo?.rows ?? []).map((row: any, index: number) => (
                  <li key={index} className="flex justify-between">
                    <span className="text-gray-300">{row[0]}</span>
                    <span className="font-medium">{formatNumber(row[1])}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 flex flex-col">
            <h3 className="font-semibold mb-4">Device Types</h3>
            <div className="h-48 overflow-y-auto pr-1 custom-scrollbar">
              <ul className="space-y-2">
                {(devices?.rows ?? []).map((row: any, index: number) => (
                  <li key={index} className="flex justify-between">
                    <span className="text-gray-300">{row[0]}</span>
                    <span className="font-medium">{formatNumber(row[1])}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FILTER BAR */}
        <section className="flex flex-wrap gap-4 mb-6 bg-gray-800/50 p-4 rounded-xl">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Content</option>
            <option value="videos">Long‑form Videos</option>
            <option value="shorts">Shorts</option>
          </select>

          <select
            value={filterMetric}
            onChange={(e) => setFilterMetric(e.target.value)}
            className="bg-gray-700 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="views">Views</option>
            <option value="likes">Likes</option>
            <option value="comments">Comments</option>
            <option value="averageViewPercentage">Retention %</option>
            <option value="averageViewDuration">Avg View Duration</option>
            <option value="subscribersGained">Subscribers Gained</option>
            <option value="healthScore">Health Score</option>
            <option value="viralProbability">Viral Probability</option>
            <option value="relativeViews">Relative Views</option>
            <option value="relativeRetention">Relative Retention</option>
            <option value="relativeEngagement">Relative Engagement</option>
            <option value="relativeSubscribers">Relative Subs</option>
          </select>
        </section>

        {/* VIDEO CARDS */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Top Videos ({filteredVideos.length})</h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((video) => {
              const stats = video.stats;
              const meta = video.meta;
              const insight = video.insight;

              const percent =
                maxViews > 0
                  ? Math.round(((stats.views || 0) / maxViews) * 100)
                  : 0;

              return (
                <div key={video.videoId} className="bg-gray-800 rounded-xl p-4">
                  <img
                    src={meta.thumbnails?.medium?.url}
                    alt={meta.title || "Video thumbnail"}
                    className="rounded-lg mb-3 w-full h-40 object-cover"
                  />

                  <div className="flex items-start justify-between mb-1 gap-2">
                    <h3 className="font-semibold line-clamp-2">{meta.title || "Untitled Video"}</h3>
                    {video.isShort ? (
                      <span className="text-xs text-indigo-400 bg-indigo-900 px-2 py-1 rounded shrink-0">
                        SHORT
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded shrink-0">
                        VIDEO
                      </span>
                    )}
                  </div>

                  <p className="text-gray-400 text-sm mb-4">
                    {meta.publishedAt ? new Date(meta.publishedAt).toLocaleDateString() : "—"}
                  </p>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Views</span>
                      <span>{formatNumber(stats.views)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Likes</span>
                      <span>{formatNumber(stats.likes)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Comments</span>
                      <span>{formatNumber(stats.comments)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Avg View %</span>
                      <span>
                        {stats.averageViewPercentage
                          ? `${stats.averageViewPercentage.toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="h-2 bg-gray-700 rounded">
                      <div
                        className="h-2 bg-indigo-500 rounded"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{percent}% of top video</div>
                  </div>

                  <div className="mt-4 border-t border-gray-700 pt-4 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Health Score</span>
                      <span className="font-bold">
                        {insight?.healthScore ?? insight?.health_score ?? "—"}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Viral Chance</span>
                      <span className="font-bold text-green-400">
                        {insight?.viralProbability ?? insight?.viral_probability ?? "—"}%
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Relative Views</span>
                      <span>{insight?.relativeViews ?? insight?.relative_views ?? "—"}x</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Relative Retention</span>
                      <span>{insight?.relativeRetention ?? insight?.relative_retention ?? "—"}x</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Relative Engagement</span>
                      <span>{insight?.relativeEngagement ?? insight?.relative_engagement ?? "—"}x</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Relative Subs</span>
                      <span>{insight?.relativeSubscribers ?? insight?.relative_subscribers ?? "—"}x</span>
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