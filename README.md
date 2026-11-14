# Automated Job Applications

HireBot is an AI‑powered agent that automates the entire tech job search workflow. By continuously scanning developer‑focused job boards and submitting applications in seconds, it enables developers to achieve **automated job applications** without the manual overhead of copying and pasting resumes.

## Problem

Finding and applying to tech positions is time‑consuming. Developers must monitor multiple job boards, tailor each application, and race against other candidates who submit minutes after a posting appears. This manual workflow leads to missed opportunities, burnout, and slower hiring cycles.

## Solution

HireBot removes the repetitive steps by:

- Scraping popular developer job boards in real time.
- Matching each posting against your skill profile and preferences.
- Auto‑filling application fields and attaching your resume.
- Submitting the application instantly via a simple API.

The result is fast, reliable **automated job applications** that reach employers before most human applicants.

## Who is it for

- Software engineers (front‑end, back‑end, full‑stack, DevOps) seeking new roles.
- Recent graduates and career changers who need a high‑velocity approach to break into tech.
- Freelancers and contractors who want to explore full‑time opportunities without sacrificing billable hours.

## Features

- **Job posting scraper** – the API uses a built‑in mock scraper that mimics real‑time job board crawling.
- **AI matching engine** – filters listings based on keywords, locations, and experience level supplied in the request.
- **Resume submission bot** – automatically prepares the payload for each matched posting (actual submission is simulated in the demo).
- **Health check endpoint** – `GET /health` returns service status and a timestamp.
- **Search endpoint** – `POST /search` accepts a `JobQuery` and returns a list of matching `JobPosting` objects.
- **Docker support** – containerised deployment for consistent environments.

## Use cases

1. **Programmatic job sweep** – schedule a nightly script that calls `/search` with your preferred keywords and locations, then processes the returned postings.
2. **Targeted stack search** – query the API with specific technology keywords (e.g., React, Go, Kubernetes) to receive only relevant listings.
3. **Integration with CI/CD** – run the container as part of a workflow that logs matched jobs and notifies you via email or Slack.

## Installation and configuration

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run locally with hot‑reload
uvicorn app:app --reload
```

### Docker

```bash
# Build the image
docker build -t hirebot .

# Run the container
docker run -p 8000:8000 hirebot
```

Configuration (e.g., resume path, skill keywords, preferred locations, salary range) is stored in `config.yaml`. Edit this file before starting the service.

## Usage examples

- **Check service health**
  ```bash
  curl http://localhost:8000/health
  ```

- **Search for jobs**
  ```bash
  curl -X POST http://localhost:8000/search \
       -H "Content-Type: application/json" \
       -d '{
            "keywords": ["Backend", "Python"],
            "locations": ["remote"],
            "experience_level": "mid",
            "max_results": 5
          }'
  ```

- **Run a one‑time sweep script** (provided in the repository)
  ```bash
  python run_sweep.py --once
  ```

## Limitations

- The current implementation uses a static mock data set; real‑world scraping and form submission are not included.
- Only job boards that expose simple HTML forms are compatible; sites with complex CAPTCHAs or multi‑step verification require manual handling.
- Matching relies on exact keyword matches; ambiguous or missing skill tags may reduce relevance.
- Supported language is English for both postings and resumes.
