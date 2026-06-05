"""Small helpers shared by posts, votes, and AI flows."""

from categories import is_board_category
from models import Post


def tags_list(post: Post) -> list[str]:
    raw = getattr(post, "tags", None) or ""
    return [x.strip() for x in str(raw).split(",") if x.strip()]


def post_option_list(post: Post) -> list[str]:
    if is_board_category(getattr(post, "category", None)):
        return []
    return [o.strip() for o in (post.options or "").split(",") if o.strip()]
