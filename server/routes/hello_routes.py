from fastapi import APIRouter

router = APIRouter()

@router.get("/hello")
def hello():
    print("Hello endpoint was called")
    return {"message": "Hello, World!"}