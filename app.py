from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, validator
from typing import List
import datetime
import random

app = FastAPI(title="HireBot API", version="0.1.0")


@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "timestamp": datetime.datetime.utcnow().isoformat() + "Z"}


class JobQuery(BaseModel):
    """Parameters for a job search request."""
    keywords: List[str] = Field(..., description="Keywords to match in job titles")
    locations: List[str] = Field(
        default_factory=lambda: ["remote"], description="Preferred locations"
    )
    experience_level: str = Field(
        "mid", description="Experience level: junior, mid, senior"
    )
    max_results: int = Field(5, ge=1, le=20, description="Maximum number of jobs to return")

    @validator("experience_level")
    def validate_experience(cls, v):
        allowed = {"junior", "mid", "senior"}
        if v not in allowed:
            raise ValueError(f"experience_level must be one of {allowed}")
        return v


class JobPosting(BaseModel):
    """Simplified representation of a job posting."""
    id: str
    title: str
    company: str
    location: str
    posted_date: str
    apply_url: str


# Mock data pool – in a real system this would be scraped from job boards
MOCK_JOBS = [
    {
        "id": "1",
        "title": "Backend Engineer",
        "company": "TechCorp",
        "location": "remote",
        "posted_date": "2024-10-01",
        "apply_url": "https://jobs.techcorp.com/1",
    },
    {
        "id": "2",
        "title": "Frontend Developer",
        "company": "InnovateX",
        "location": "Paris, France",
        "posted_date": "2024-09-28",
        "apply_url": "https://jobs.innovatex.com/2",
    },
    {
        "id": "3",
        "title": "Full‑Stack Engineer",
        "company": "DevSolutions",
        "location": "remote",
        "posted_date": "2024-09-30",
        "apply_url": "https://jobs.devsolutions.com/3",
    },
    {
        "id": "4",
        "title": "Data Engineer",
        "company": "DataWorks",
        "location": "Berlin, Germany",
        "posted_date": "2024-09-25",
        "apply_url": "https://jobs.dataworks.com/4",
    },
    {
        "id": "5",
        "title": "Machine Learning Engineer",
        "company": "AI Labs",
        "location": "remote",
        "posted_date": "2024-09-27",
        "apply_url": "https://jobs.ailabs.com/5",
    },
]


def filter_jobs(query: JobQuery) -> List[JobPosting]:
    """Very simple in‑memory filter that mimics a job‑board search."""
    results = []
    for job in MOCK_JOBS:
        title_match = any(kw.lower() in job["title"].lower() for kw in query.keywords)
        location_match = any(
            loc.lower() in job["location"].lower() for loc in query.locations
        )
        if title_match and location_match:
            results.append(JobPosting(**job))
        if len(results) >= query.max_results:
            break
    return results


@app.post("/search", response_model=List[JobPosting])
async def search_jobs(query: JobQuery):
    """
    Demo endpoint that simulates HireBot's core feature:
    searching tech job boards and returning a short list of matching postings.
    """
    matches = filter_jobs(query)
    if not matches:
        raise HTTPException(status_code=404, detail="No matching jobs found")
    # Randomly shuffle to emulate varied results from different boards
    random.shuffle(matches)
    return matches[: query.max_results]
