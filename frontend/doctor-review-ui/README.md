# EHR Twin workstation

Run `npm ci` then `npm run dev` here. Open http://localhost:5188/overview.

Pages: overview, patients, forecast, scenarios, anatomy, review, genomics, reports, evidence. Patient/date/reading selections are encoded in the URL; browser navigation and direct links preserve the selected snapshot.

Vite proxies twin APIs to 8004, workflow APIs to 8005, identity APIs to 8002, fusion APIs to 8003, terminology to 8001 and other ingestion APIs to 8000. Start services using `python scripts/run_app.py` from the repository root.

The warm paper/charcoal/green interface retains the existing anatomical artwork. Model probabilities, trajectories and genuine TreeSHAP are returned by the backend at the exact selected timestamp. No fabricated fallback forecasts are displayed. Recorded CGM replay is distinguished from live devices; scenarios and organ physiology remain explicitly illustrative.

`npm run build` checks TypeScript and produces the bundle. `npm run lint` checks source. Root pytest tests backend data/model/workflow behavior.
