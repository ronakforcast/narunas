.PHONY: setup fetch build-db build-indirect export-static build-web run test

PY := .venv/bin/python

setup:
	python3 -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt
	cd web && npm install

fetch:
	$(PY) scripts/fetch_data.py

build-db:
	$(PY) scripts/build_db.py

build-indirect:
	$(PY) scripts/build_indirect.py

export-static:
	$(PY) scripts/export_static.py

build-web:
	cd web && npm run build

run: build-web
	$(PY) -m uvicorn server.app:app --port 8765

test:
	$(PY) -m pytest tests/ -q
	cd web && npm run test -- --run
