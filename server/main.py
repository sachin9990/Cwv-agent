from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import hello_routes
from routes.tickets import router as tickets_router
from routes.metrics import router as metrics_router
from routes.pagespeed import router as pagespeed_router
from routes.comments import router as comments_router

app = FastAPI()

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
