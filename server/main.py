from dotenv import load_dotenv
load_dotenv()

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import hello_routes
from routes.tickets import router as tickets_router
from routes.metrics import router as metrics_router
from routes.pagespeed import router as pagespeed_router
from routes.comments import router as comments_router
from routes.history import router as history_router

REQUIRED_ENV_VARS = [
    "AZDO_ORG",
    "AZDO_PROJECT",
    "AZDO_PAT",
    "NEWRELIC_ACCOUNT_ID",
    "NEWRELIC_API_KEY",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [v for v in REQUIRED_ENV_VARS if not os.getenv(v)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hello_routes.router)
app.include_router(tickets_router)
app.include_router(metrics_router)
app.include_router(pagespeed_router)
app.include_router(comments_router)
app.include_router(history_router)
