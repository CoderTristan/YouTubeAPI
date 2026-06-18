from statistics import mean


class AnalyticsEngine:

    @staticmethod
    def relative_score(value, average):
        if average <= 0:
            return 1.0
        return value / average

    @staticmethod
    def engagement_rate(
        views: int,
        likes: int,
        comments: int
    ):
        if views <= 0:
            return 0

        return (
            likes +
            comments * 2
        ) / views

    @staticmethod
    def subscriber_conversion(
        views: int,
        subscribers_gained: int
    ):
        if views <= 0:
            return 0

        return subscribers_gained / views

    @staticmethod
    def watch_time_efficiency(
        views: int,
        minutes_watched: float
    ):
        if views <= 0:
            return 0

        return minutes_watched / views

    @staticmethod
    def growth_velocity(
        current_value,
        previous_value
    ):
        if previous_value <= 0:
            return 0

        return (
            current_value -
            previous_value
        ) / previous_value

    @staticmethod
    def discovery_score(
        browse_views,
        suggested_views,
        search_views,
        total_views
    ):
        if total_views <= 0:
            return 0

        weighted = (
            browse_views * 1.0 +
            suggested_views * 0.8 +
            search_views * 0.6
        )

        return weighted / total_views

    @staticmethod
    def video_health_score(
        relative_views,
        relative_retention,
        relative_engagement,
        relative_subscribers
    ):
        score = (
            relative_views * 0.25 +
            relative_retention * 0.35 +
            relative_engagement * 0.25 +
            relative_subscribers * 0.15
        )

        return round(
            min(score * 100, 100),
            2
        )

    @staticmethod
    def viral_probability(
        relative_views,
        relative_retention,
        relative_engagement
    ):
        score = (
            relative_views * 0.4 +
            relative_retention * 0.3 +
            relative_engagement * 0.3
        )

        probability = min(
            score / 3,
            1
        )

        return round(
            probability * 100,
            1
        )

    @staticmethod
    def average_multiplier(
        historical_videos
    ):
        multipliers = []

        for video in historical_videos:

            day1 = video.get("day1_views", 0)
            day30 = video.get("day30_views", 0)

            if day1 > 0:
                multipliers.append(
                    day30 / day1
                )

        if not multipliers:
            return 1

        return mean(multipliers)

    @staticmethod
    def predict_30_day_views(
        day1_views,
        multiplier
    ):
        return int(
            day1_views *
            multiplier
        )

    @staticmethod
    def best_upload_time(
        uploads
    ):
        buckets = {}

        for upload in uploads:

            hour = upload["hour"]

            buckets.setdefault(
                hour,
                []
            ).append(
                upload["views"]
            )

        if not buckets:
            return None

        return max(
            buckets.items(),
            key=lambda x: mean(x[1])
        )[0]

    @staticmethod
    def topic_performance(
        videos
    ):
        topics = {}

        for video in videos:

            topic = video["topic"]

            topics.setdefault(
                topic,
                []
            ).append(
                video["views"]
            )

        return {
            topic: round(mean(views), 2)
            for topic, views
            in topics.items()
        }

    @staticmethod
    def channel_health(
        avg_retention,
        avg_engagement,
        growth_rate,
        sub_conversion
    ):
        score = (
            avg_retention * 0.35 +
            avg_engagement * 20 +
            growth_rate * 25 +
            sub_conversion * 100
        )

        return round(
            min(score, 100),
            2
        )