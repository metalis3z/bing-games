"""Build data/games.json (+ data/games.js) for the studio site.

Game list comes from the Open Cloud API key (ROBLOX_API_KEY):
  1. GET apis.roblox.com/ads-management/v1/advertisable-universes  -> every universe the key owner can advertise
  2. public games of the user and of every group the user owns (games.roblox.com)  -> merged in
  3. GET apis.roblox.com/cloud/v2/universes/{id}  -> visibility; only PUBLIC games are kept (configurable)
Live numbers (playing, visits, favorites) and images come from the public Roblox web APIs.
The key is only read here, at build time; it never reaches the browser.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = {"User-Agent": "studio-site/1.0", "Accept": "application/json"}


def request(url, key=None, tries=5):
    headers = dict(UA)
    if key:
        headers["x-api-key"] = key
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < tries - 1:
                time.sleep(2 + attempt * 3)
                continue
            raise
        except urllib.error.URLError:
            if attempt < tries - 1:
                time.sleep(2 + attempt * 3)
                continue
            raise


def paged(url):
    out, cursor = [], ""
    while True:
        res = request(url + ("&cursor=" + cursor if cursor else ""))
        out += res.get("data", [])
        cursor = res.get("nextPageCursor")
        if not cursor:
            return out


def chunks(items, n):
    for i in range(0, len(items), n):
        yield items[i:i + n]


def warn(msg):
    print("warning: " + msg, file=sys.stderr)


def clean_name(name):
    # "[☕] Make a Latte" -> "Make a Latte"; "[BETA] Empang Mania" keeps its tag out too
    return re.sub(r"^(\s*[\[\(][^\]\)]{0,12}[\]\)]\s*)+", "", name).strip() or name


def main():
    with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    user_id = cfg["userId"]
    key = os.environ.get("ROBLOX_API_KEY", "").strip()
    if not key and os.path.exists(os.path.expanduser("~/.roblox_opencloud_key")):
        with open(os.path.expanduser("~/.roblox_opencloud_key"), encoding="utf-8") as f:
            key = f.read().strip()
    exclude = set(cfg.get("excludeUniverseIds", []))

    # Groups: every group the user owns, plus any listed in config.
    # One roles call (names, member counts) + one batch call (owners): groups v1 per id hits 429 fast.
    group_ids = list(dict.fromkeys(cfg.get("groupIds", [])))
    joined = {g["group"]["id"]: g["group"] for g in
              request("https://groups.roblox.com/v2/users/%d/groups/roles" % user_id).get("data", [])}
    if cfg.get("detectOwnedGroups", True) and joined:
        for part in chunks(list(joined), 100):
            for g in request("https://groups.roblox.com/v2/groups?groupIds=" + ",".join(map(str, part))).get("data", []):
                if (g.get("owner") or {}).get("id") == user_id and g["id"] not in group_ids:
                    group_ids.append(g["id"])
    groups = []
    for gid in group_ids:
        info = joined.get(gid) or request("https://groups.roblox.com/v1/groups/%d" % gid)
        groups.append({"id": gid, "name": info["name"], "members": info.get("memberCount", 0),
                       "url": "https://www.roblox.com/communities/%d" % gid})

    # Universe list: API key first, then public listings
    ids = []
    if key:
        try:
            res = request("https://apis.roblox.com/ads-management/v1/advertisable-universes", key)
            ids += [int(u["universeId"]) for u in res.get("advertisableUniverses", [])]
        except Exception as e:
            warn("advertisable-universes failed: %s" % e)
    else:
        warn("no ROBLOX_API_KEY: using public listings only")
    listed = paged("https://games.roblox.com/v2/users/%d/games?accessFilter=Public&limit=50&sortOrder=Desc" % user_id)
    for gid in group_ids:
        listed += paged("https://games.roblox.com/v2/groups/%d/gamesV2?accessFilter=Public&limit=100&sortOrder=Desc" % gid)
    ids += [g["id"] for g in listed]
    ids = [u for u in dict.fromkeys(ids) if u not in exclude]

    # Open Cloud universe: visibility, description, social links
    cloud = {}
    if key:
        for uid in ids:
            try:
                cloud[uid] = request("https://apis.roblox.com/cloud/v2/universes/%d" % uid, key)
            except Exception as e:
                warn("cloud universe %s: %s" % (uid, e))
    if cfg.get("publicOnly", True) and cloud:
        ids = [u for u in ids if cloud.get(u, {}).get("visibility", "PUBLIC") == "PUBLIC"]

    details, icons, shots = {}, {}, {}
    for part in chunks(ids, 50):
        q = ",".join(map(str, part))
        for d in request("https://games.roblox.com/v1/games?universeIds=" + q).get("data", []):
            details[d["id"]] = d
        for t in request("https://thumbnails.roblox.com/v1/games/icons?universeIds=%s&returnPolicy=PlaceHolder&size=512x512&format=Webp&isCircular=false" % q).get("data", []):
            icons[t["targetId"]] = t.get("imageUrl")
        for t in request("https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=%s&countPerUniverse=10&defaults=true&size=768x432&format=Webp&isCircular=false" % q).get("data", []):
            shots[t["universeId"]] = [s["imageUrl"] for s in t.get("thumbnails") or [] if s.get("imageUrl")]

    games, discord_invites = [], []
    for uid in ids:
        d = details.get(uid)
        if not d:
            continue
        c = cloud.get(uid, {})
        link = (c.get("discordSocialLink") or {}).get("uri")
        if link:
            discord_invites.append(link)
        gallery = shots.get(uid, [])
        games.append({
            "id": uid,
            "placeId": d["rootPlaceId"],
            "name": clean_name(d["name"]),
            "fullName": d["name"],
            "description": (c.get("description") or d.get("description") or "").strip(),
            "creator": {"id": d["creator"]["id"], "name": d["creator"]["name"], "type": d["creator"]["type"]},
            "genre": d.get("genre_l2") or d.get("genre_l1") or d.get("genre"),
            "playing": d["playing"],
            "visits": d["visits"],
            "favorites": d.get("favoritedCount", 0),
            "created": c.get("createTime") or d.get("created"),
            "updated": d.get("updated"),
            "icon": icons.get(uid),
            "thumbnail": gallery[0] if gallery else None,
            "gallery": gallery,
            "url": "https://www.roblox.com/games/%d" % d["rootPlaceId"],
        })

    games.sort(key=lambda g: (-g["playing"], -g["visits"]))
    created = sorted(g["created"] for g in games if g.get("created"))
    totals = {
        "games": len(games),
        "playing": sum(g["playing"] for g in games),
        "visits": sum(g["visits"] for g in games),
        "favorites": sum(g["favorites"] for g in games),
        "members": sum(g["members"] for g in groups),
        "since": created[0][:10] if created else None,
    }
    out = {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "studio": cfg.get("studio", {}),
        "contact": dict(cfg.get("contact", {}), discordInvite=cfg.get("contact", {}).get("discordInvite") or (discord_invites[0] if discord_invites else None)),
        "groups": groups,
        "totals": totals,
        "games": games,
    }
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "games.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    # Same data as a script so index.html also works when opened straight from disk
    with open(os.path.join(DATA, "games.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("window.SITE_DATA = " + json.dumps(out, ensure_ascii=False) + ";\n")
    print("%d games, %d playing, %d visits, %d favorites, %d members (key: %s)" % (
        totals["games"], totals["playing"], totals["visits"], totals["favorites"], totals["members"], "yes" if key else "no"))


if __name__ == "__main__":
    main()
