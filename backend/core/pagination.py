"""
TRACK — shared DRF pagination.

`PAGE_SIZE` alone only sets the default page size. The `page_size` query
parameter a client may send is controlled by `PageNumberPagination.
page_size_query_param`, which is a *class* attribute — DRF has no
`PAGE_SIZE_QUERY_PARAM` setting, so the key that used to sit in
`config/settings.py` was silently ignored. Both TRACK clients request
`page_size=100` and then follow `next` at most ten times, so on every
endpoint that fell back to the bare default they only ever saw the first
200 rows.
"""

from rest_framework.pagination import PageNumberPagination


class TrackPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
