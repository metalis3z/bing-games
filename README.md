# Bing Games website

Static site (`index.html`, `games.html`) that shows every public Bing Games experience with live numbers from Roblox.

## Where the data comes from

`scripts/fetch_games.py` builds `data/games.json` and `data/games.js`. That file is the game list (names, descriptions, images, links) and the saved counts the page uses if a live request fails.

1. Open Cloud API key (`ROBLOX_API_KEY`, falls back to `~/.roblox_opencloud_key`):
   - `GET apis.roblox.com/ads-management/v1/advertisable-universes` lists every universe the key owner can advertise (scope `ad.campaign:read`).
   - `GET apis.roblox.com/cloud/v2/universes/{id}` gives visibility, description and the Discord social link (scope `universe:read`). Only `PUBLIC` games are kept (`publicOnly` in `config.json`).
2. Public listings of the user and of every group the user owns are merged in, so a new public game appears even before it is advertisable.
3. Images, and the saved counts: `games.roblox.com/v1/games`, `thumbnails.roblox.com` (icons 512, screenshots 768x432, up to 10 per game).

On each visit, `index.html` and `games.html` refetch playing, visits and favorites in the browser from `https://games.roproxy.com/v1/games?universeIds=...`. That host returns the same JSON as `games.roblox.com/v1/games` (`playing`, `visits`, `favoritedCount`) and sends `Access-Control-Allow-Origin: *`. `games.roblox.com` does not send CORS headers, so a page on GitHub Pages cannot read it. If the request fails or times out, the page keeps the saved counts and says so once. Community member counts stay on the saved copy. The time of the fetch is shown once on the page.

The key is only used by the script. It never ends up in the HTML, the JSON, or the browser.

## Run locally

```bash
python scripts/fetch_games.py
python -m http.server 8770
```

Then open http://localhost:8770. `index.html` also works when opened straight from disk, because the data is loaded from `data/games.js`.

## Deploy (GitHub Pages)

1. Push this folder to a GitHub repository.
2. Settings > Secrets and variables > Actions: add `ROBLOX_API_KEY` (the Open Cloud key, needs `ad.campaign:read` and `universe:read`).
3. Settings > Pages: deploy from branch `main`, folder `/`.
4. `.github/workflows/refresh.yml` refreshes the game list every 30 minutes. Playing, visits and favorites on the page update on each visit even if that workflow has not run. A new public game still needs a successful run before it appears, and a game that goes private disappears on the next successful run.

Open Cloud keys expire after 60 days without use; the workflow uses it every 30 minutes, so it stays alive.

## Config (`config.json`)

- `userId`: Roblox user (lolbinng).
- `groupIds`: groups always included. Owned groups are also detected automatically (`detectOwnedGroups`).
- `excludeUniverseIds`: hide a game.
- `contact.discord`, `contact.discordInvite` (empty = taken from the game's Discord social link), `studio.mainGroupId`.
