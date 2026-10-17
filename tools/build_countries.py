"""Собирает game/content/countries.json из Natural Earth (public domain).

Запуск (нужен только при обновлении контуров, игре не нужен):
    python tools/build_countries.py ne_50m_admin_0_countries.geojson game/content/countries.json

Каждую страну проецируем равновеликой азимутальной проекцией Ламберта
с центром в самой стране — поэтому площади на экране сравниваются честно,
без растяжения, как на привычной карте Меркатора.

Страны и территории со спорными границами сознательно не берём.
"""
import json
import math
import sys

R = 6371.0072  # радиус равновеликой сферы, км

# key, имя, площадь км², выбор полигонов, факт
COUNTRIES = [
    ("africa", "Африка", 30370000, {"continent": "Africa"},
     "В Африку поместятся США, Китай, Индия и почти вся Европа вместе!"),
    ("south_america", "Южная Америка", 17840000, {"continent": "South America", "extra": ("FRA", (-60, -50, 0, 7))},
     "Здесь течёт Амазонка — самая полноводная река на планете."),
    ("antarctica", "Антарктида", 14200000, {"a3": "ATA"},
     "Лёд тут местами толщиной почти 5 километров."),
    ("canada", "Канада", 9984670, {"a3": "CAN"},
     "На привычной карте Канада выглядит гигантом, а на деле она лишь чуть больше США."),
    ("usa48", "США без Аляски", 8080000, {"a3": "USA", "box": (-130, -60, 24, 50)},
     "А ещё у США есть Аляска — в неё влезут три Франции!"),
    ("brazil", "Бразилия", 8515767, {"a3": "BRA"},
     "Бразилия больше всей Австралии."),
    ("australia", "Австралия", 7692024, {"a3": "AUS", "box": (110, 160, -45, -9)},
     "Единственная страна, которая занимает целый материк."),
    ("argentina", "Аргентина", 2780400, {"a3": "ARG"},
     "Тянется от жарких тропиков почти до самой Антарктиды."),
    ("kazakhstan", "Казахстан", 2724900, {"a3": "KAZ"},
     "Самая большая страна в мире без выхода к океану."),
    ("algeria", "Алжир", 2381741, {"a3": "DZA"},
     "Самая большая страна Африки, и почти вся она — пустыня Сахара."),
    ("greenland", "Гренландия", 2166086, {"a3": "GRL"},
     "На обычной карте Гренландия размером с Африку. А на деле Африка больше в 14 раз! Плоские карты растягивают всё, что близко к полюсам."),
    ("saudi", "Саудовская Аравия", 2149690, {"a3": "SAU"},
     "В этой стране нет ни одной постоянной реки."),
    ("mexico", "Мексика", 1964375, {"a3": "MEX"},
     "Родина шоколада и кукурузы."),
    ("indonesia", "Индонезия", 1904569, {"a3": "IDN"},
     "Состоит больше чем из 17 000 островов."),
    ("iran", "Иран", 1648195, {"a3": "IRN"},
     "Здесь пустыня Лут — одно из самых жарких мест на Земле."),
    ("mongolia", "Монголия", 1564116, {"a3": "MNG"},
     "Лошадей тут больше, чем людей."),
    ("egypt", "Египет", 1001450, {"a3": "EGY"},
     "Почти все жители живут вдоль одной реки — Нила."),
    ("turkey", "Турция", 783562, {"a3": "TUR"},
     "Стоит сразу в двух частях света — в Европе и в Азии."),
    ("chile", "Чили", 756102, {"a3": "CHL", "box": (-80, -60, -60, -15)},
     "Длинная, как лапша: 4 300 км в длину и всего около 180 км в ширину."),
    ("madagascar", "Мадагаскар", 587041, {"a3": "MDG"},
     "Дикие лемуры живут только здесь."),
    ("france", "Франция", 551695, {"a3": "FRA", "box": (-6, 10, 41, 52)},
     "Самая посещаемая туристами страна в мире."),
    ("spain", "Испания", 505990, {"a3": "ESP", "box": (-10, 5, 35, 44.5)},
     "Делает почти половину оливкового масла в мире."),
    ("sweden", "Швеция", 450295, {"a3": "SWE"},
     "Здесь больше 260 000 островов."),
    ("japan", "Япония", 377975, {"a3": "JPN"},
     "Здесь больше 100 действующих вулканов."),
    ("germany", "Германия", 357588, {"a3": "DEU"},
     "Здесь делают больше 1 500 видов колбасы."),
    ("finland", "Финляндия", 338455, {"a3": "FIN"},
     "Страна озёр: их тут больше 180 000."),
    ("italy", "Италия", 302068, {"a3": "ITA"},
     "По форме похожа на сапог."),
    ("new_zealand", "Новая Зеландия", 268021, {"a3": "NZL", "box": (160, 180, -48, -33)},
     "Овец здесь больше, чем людей."),
    ("uk", "Великобритания", 242495, {"a3": "GBR"},
     "Ни одно место в стране не дальше 120 км от моря."),
    ("belarus", "Беларусь", 207600, {"a3": "BLR"},
     "Здесь живут зубры — самые большие звери Европы."),
    ("cuba", "Куба", 109884, {"a3": "CUB"},
     "Здесь живёт самая маленькая птица в мире — колибри-пчёлка."),
    ("iceland", "Исландия", 103000, {"a3": "ISL"},
     "Тут вообще нет комаров!"),
    ("portugal", "Португалия", 92212, {"a3": "PRT", "box": (-10, -6, 36, 43)},
     "Делает половину пробок для бутылок в мире."),
    ("netherlands", "Нидерланды", 41543, {"a3": "NLD", "box": (3, 8, 50, 54)},
     "Четверть страны лежит ниже уровня моря."),
    ("switzerland", "Швейцария", 41285, {"a3": "CHE"},
     "Почти две трети страны — горы Альпы."),
]


def polygons(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]


def ring_centroid(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def in_box(pt, box):
    x0, x1, y0, y1 = box
    return x0 <= pt[0] <= x1 and y0 <= pt[1] <= y1


def select(features, rule):
    out = []
    for f in features:
        p = f["properties"]
        take_feature = (rule.get("a3") and p["ADM0_A3"] == rule["a3"]) or \
                       (rule.get("continent") and p["CONTINENT"] == rule["continent"])
        extra = rule.get("extra")
        for poly in polygons(f["geometry"]):
            c = ring_centroid(poly[0])
            if take_feature:
                if "box" in rule and not in_box(c, rule["box"]):
                    continue
                out.append(poly)
            elif extra and p["ADM0_A3"] == extra[0] and in_box(c, extra[1]):
                out.append(poly)
    return out


def laea(lon, lat, lon0, lat0):
    l, p = math.radians(lon), math.radians(lat)
    l0, p0 = math.radians(lon0), math.radians(lat0)
    dl = (l - l0 + math.pi) % (2 * math.pi) - math.pi
    k = math.sqrt(2 / (1 + math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(dl)))
    x = R * k * math.cos(p) * math.sin(dl)
    y = R * k * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(dl))
    return x, -y  # в SVG ось y смотрит вниз


def area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2


def dp(points, tol):
    """Упрощение Дугласа — Пекера."""
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        best, idx = -1, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def dp_ring(ring, tol):
    """Замкнутое кольцо делим в самой дальней от начала точке, иначе DP вырождается."""
    x0, y0 = ring[0]
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - x0) ** 2 + (ring[i][1] - y0) ** 2)
    if far == 0:
        return ring
    return dp(ring[:far + 1], tol)[:-1] + dp(ring[far:], tol)


def center_of(polys):
    big = max(polys, key=lambda p: len(p[0]))
    if all(pt[1] < -60 for pt in big[0]):
        return 0.0, -90.0
    # центр по самому крупному кольцу, долготы считаем относительно него
    ref = big[0][0][0]
    lons, lats = [], []
    for poly in polys:
        for lon, lat in poly[0]:
            lons.append((lon - ref + 180) % 360 - 180 + ref)
            lats.append(lat)
    return (min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2


def build(features, spec):
    key, name, official, rule, fact = spec
    polys = select(features, rule)
    if not polys:
        raise SystemExit("нет полигонов для " + key)
    lon0, lat0 = center_of(polys)
    proj = [[[laea(lon, lat, lon0, lat0) for lon, lat in ring] for ring in poly] for poly in polys]
    total = sum(area(p[0]) - sum(area(h) for h in p[1:]) for p in proj)
    proj = [p for p in proj if area(p[0]) >= total * 0.0015]
    xs = [x for p in proj for r in p for x, _ in r]
    ys = [y for p in proj for r in p for _, y in r]
    minx, miny = min(xs), min(ys)
    span = max(max(xs) - minx, max(ys) - miny)
    unit = 1000.0 / span
    tol = span * 0.0018
    parts = []
    kept_area = 0.0
    for poly in proj:
        for j, ring in enumerate(poly):
            r = dp_ring(ring, tol)
            if len(r) < 4:
                continue
            pts = [(round((x - minx) * unit), round((y - miny) * unit)) for x, y in r]
            a = area([(x / unit, y / unit) for x, y in pts])
            kept_area += -a if j else a
            seg = "M%d %d" % pts[0]
            px, py = pts[0]
            rel = []
            for x, y in pts[1:-1]:
                if (x, y) != (px, py):
                    rel.append("%d %d" % (x - px, y - py))
                    px, py = x, y
            parts.append(seg + "l" + " ".join(rel) + "z")
    w = round((max(xs) - minx) * unit)
    h = round((max(ys) - miny) * unit)
    km_per_unit = 1 / unit
    # площадь фигуры в единицах² — по ней игра масштабирует контур до официальной площади
    unit_area = kept_area * unit * unit
    print("%-14s проекция %10.0f км², официально %10.0f км², отношение %.3f, %d байт" % (
        key, kept_area, official, kept_area / official, sum(len(p) for p in parts)))
    return {
        "id": key, "name": name, "area": official, "fact": fact,
        "w": w, "h": h, "unitArea": round(unit_area), "kmPerUnit": round(km_per_unit, 4),
        "d": "".join(parts),
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    src, dst = sys.argv[1], sys.argv[2]
    features = json.load(open(src, encoding="utf-8"))["features"]
    out = [build(features, spec) for spec in COUNTRIES]
    with open(dst, "w", encoding="utf-8") as f:
        json.dump({"source": "Natural Earth 1:50m, public domain", "countries": out},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("готово:", dst)


if __name__ == "__main__":
    main()
