"""Small helpers shared by posts, votes, and AI flows."""

from models import Post


def tags_list(post: Post) -> list[str]:
    raw = getattr(post, "tags", None) or ""
    return [x.strip() for x in str(raw).split(",") if x.strip()]


def post_option_list(post: Post) -> list[str]:
    return [o.strip() for o in post.options.split(",") if o.strip()]
