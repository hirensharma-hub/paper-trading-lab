# New Oracle Always Free deployment

This guide is for a new, dedicated Oracle VM. It does not use or modify the Lesson Lift VM, Chrome, TradingView, or any YouTube study tool. The runtime is paper-only and has no real brokerage or execution adapter.

## Create the VM

In OCI, create a new Always Free VM in the chosen compartment and VCN/subnet. Select an Always Free eligible Ubuntu image and a small VM.Standard.E2.1.Micro shape. Add an SSH public key. Keep the subnet private or restrict ingress to SSH from your IP; do not expose the database or runtime API publicly. Use a new instance name such as `paper-trading-lab-forward-01` so it cannot be confused with another project.

## Install and configure

```bash
sudo adduser --system --group --home /opt/paper-trading-lab papertrading
sudo apt-get update
sudo apt-get install -y git ca-certificates curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo git clone https://github.com/hirensharma-hub/paper-trading-lab.git /opt/paper-trading-lab
cd /opt/paper-trading-lab
sudo npm ci
sudo install -d -o papertrading -g papertrading /var/lib/paper-trading-lab
sudo install -d -o root -g papertrading -m 0750 /etc/paper-trading-lab
sudo install -o root -g papertrading -m 0640 .env.forward.example /etc/paper-trading-lab/forward.env
sudo chown -R papertrading:papertrading /opt/paper-trading-lab
```

Edit `/etc/paper-trading-lab/forward.env` and set `FORWARD_START_TIMESTAMP` and a long random `PAPER_API_TOKEN`. Put the Twelve Data key only in that root-owned environment file. Never commit it, echo it, or put it in a URL/log. Confirm the provider licence permits non-display internal use before enabling the key.

## Run as a service

```bash
sudo cp deploy/systemd/paper-trading-lab.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now paper-trading-lab
sudo systemctl status paper-trading-lab
sudo journalctl -u paper-trading-lab -f
curl http://127.0.0.1:3001/health
```

The daemon polls completed AMZN 5-minute bars, persists the paper broker and experience ledger, and resumes after restart. It remains online outside market hours but does not trade when the authoritative America/New_York regular session is closed. API reads require `Authorization: Bearer <PAPER_API_TOKEN>`; there are no trade, risk-override, or promotion-control endpoints.

## Operations and safety

Use `sudo systemctl restart paper-trading-lab` for a controlled restart. Verify `npm run forward:db:verify` and `npm run forward:model:verify` from the checkout. Keep the API bound to `127.0.0.1`; if remote viewing is later needed, use an authenticated SSH tunnel or a separately reviewed HTTPS reverse proxy. Never expose the DB/runtime directory or API token to the public internet. This design uses bounded JSONL ledgers and atomic snapshots instead of a native SQLite module to keep the E2.1.Micro image small and dependency-free; no full database is sent over the network.
