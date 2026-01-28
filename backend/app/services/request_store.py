from typing import Optional
from collections import OrderedDict
from app.models.chain_of_thought import ChainOfThought


class RequestStore:
    def __init__(self, max_size: int = 1000):
        self._store: OrderedDict[str, ChainOfThought] = OrderedDict()
        self._max_size = max_size

    def save(self, request_id: str, chain: ChainOfThought) -> None:
        if len(self._store) >= self._max_size:
            self._store.popitem(last=False)
        self._store[request_id] = chain

    def get(self, request_id: str) -> Optional[ChainOfThought]:
        return self._store.get(request_id)

    def exists(self, request_id: str) -> bool:
        return request_id in self._store

    def delete(self, request_id: str) -> bool:
        if request_id in self._store:
            del self._store[request_id]
            return True
        return False

    def list_recent(self, limit: int = 20) -> list[tuple[str, ChainOfThought]]:
        items = list(self._store.items())
        return items[-limit:][::-1]

    def get_by_status(self, status: str) -> list[tuple[str, ChainOfThought]]:
        return [
            (rid, chain) for rid, chain in self._store.items() if chain.status == status
        ]

    def clear(self) -> None:
        self._store.clear()


request_store = RequestStore()
