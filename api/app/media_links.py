"""Plain-text links and the photo/video size cap shared by rental uploads.

macOS turns a dragged URL into a tiny .webloc plist. Those were being stored
as files named like "photos.google.com: 4.webloc" instead of the URL inside
them. Everything here treats a link as text.
"""

import html
import re
from typing import Optional

# App-side cap. The Storage bucket limit is set separately and must be at
# least this high or Storage rejects the upload after the bytes leave the
# browser. The file itself is PUT to a signed Storage URL, not to this API.
MAX_MEDIA_BYTES = 150 * 1024 * 1024

_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_WEBLOC_URL_RE = re.compile(r"<key>\s*URL\s*</key>\s*<string>([^<]+)</string>", re.IGNORECASE)
_PHOTO_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif")
_VIDEO_EXT = (".mp4", ".mov", ".webm", ".m4v")


def extract_urls(*parts: Optional[str]) -> list[str]:
    """Every http(s) URL in the text, in order, without duplicates."""
    found: list[str] = []
    for part in parts:
        if not part:
            continue
        for raw in _URL_RE.findall(part):
            url = raw.rstrip(".,);]")
            if url not in found:
                found.append(url)
    return found


def clean_link(raw: str) -> str:
    url = (raw or "").strip().rstrip(".,);]")
    if not url.startswith(("http://", "https://")):
        raise ValueError("Paste a full link starting with https://")
    return url


def webloc_url(content: bytes) -> Optional[str]:
    """The URL inside a macOS .webloc plist, or None if this isn't one."""
    text = content.decode("utf-8", errors="replace")
    match = _WEBLOC_URL_RE.search(text)
    if not match:
        return None
    url = html.unescape(match.group(1).strip())
    if url.startswith(("http://", "https://")):
        return url
    return None


def media_kind(mime: Optional[str], file_name: str) -> str:
    """'photo' or 'video'. Raises ValueError for anything else."""
    mime_l = (mime or "").lower()
    name_l = (file_name or "").lower()
    if mime_l.startswith("video/") or name_l.endswith(_VIDEO_EXT):
        return "video"
    if mime_l.startswith("image/") or name_l.endswith(_PHOTO_EXT):
        return "photo"
    raise ValueError("Only photos and videos can be uploaded. Paste a link for anything else.")


def assert_media_size(size_bytes: Optional[int], file_name: str = "This file") -> None:
    if size_bytes is not None and size_bytes > MAX_MEDIA_BYTES:
        mb = size_bytes / (1024 * 1024)
        raise ValueError(
            f"{file_name} is {mb:.0f} MB. Files over 150 MB can't be uploaded. "
            "Try a shorter video or a smaller photo."
        )
