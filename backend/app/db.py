"""SQLAlchemy engine/session. SQLite runs in WAL mode with foreign keys on, and every
transaction starts with BEGIN IMMEDIATE so concurrent writers are serialised rather than
racing on seat counts."""
from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    is_sqlite = url.startswith('sqlite')
    engine = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 30} if is_sqlite else {})
    if is_sqlite:
        @event.listens_for(engine, 'connect')
        def _pragmas(dbapi_conn, _):
            dbapi_conn.isolation_level = None      # let SQLAlchemy's BEGIN below control transactions
            cur = dbapi_conn.cursor()
            cur.execute('PRAGMA foreign_keys=ON')
            cur.execute('PRAGMA journal_mode=WAL')
            cur.execute('PRAGMA synchronous=NORMAL')
            cur.close()

        @event.listens_for(engine, 'begin')
        def _begin(conn):
            conn.exec_driver_sql('BEGIN IMMEDIATE')
    return engine


class Database:
    def __init__(self, url: str):
        self.engine = make_engine(url)
        self.sessionmaker = sessionmaker(self.engine, expire_on_commit=False)

    def create_all(self):
        from . import models  # noqa: F401  (register tables)
        Base.metadata.create_all(self.engine)

    def session(self) -> Iterator[Session]:
        with self.sessionmaker() as session:
            yield session
