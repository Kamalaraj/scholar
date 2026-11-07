FROM python:3.12-slim

RUN pip install --no-cache-dir uv

RUN useradd --create-home --shell /bin/bash scholar
WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

COPY . .
RUN uv sync --no-dev

RUN chown -R scholar:scholar /app
USER scholar

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
