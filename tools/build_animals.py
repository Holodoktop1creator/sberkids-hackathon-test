"""Скачивает силуэты животных с PhyloPic и собирает game/content/animals.json.

Берём только изображения с лицензиями CC0 и Public Domain Mark.
Игре интернет не нужен: силуэты сохраняются внутрь JSON.

    python tools/build_animals.py raw            # скачать в tools/animals_raw.json
    python tools/build_animals.py final bbox.json game/content/animals.json

Между шагами рамки силуэтов (getBBox) считаются в браузере страницей
tools/bbox.html — так учитываются все трансформации внутри SVG.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.phylopic.org"
OK_LICENSES = (
    "https://creativecommons.org/publicdomain/zero/1.0/",
    "https://creativecommons.org/publicdomain/mark/1.0/",
)

# key, имя, латынь (варианты через |), размер в м, измерение, факт
ANIMALS = [
    ("blue_whale", "Синий кит", "Balaenoptera musculus", 27, "long", "Самое большое животное за всю историю Земли — больше любого динозавра."),
    ("sperm_whale", "Кашалот", "Physeter macrocephalus", 16, "long", "Ныряет глубже 2 км за гигантскими кальмарами."),
    ("megalodon", "Мегалодон", "Otodus megalodon|Carcharocles megalodon", 16, "long", "Вымершая акула с зубами размером с ладонь взрослого."),
    ("whale_shark", "Китовая акула", "Rhincodon typus", 12, "long", "Самая большая рыба в мире, а ест крошечный планктон."),
    ("trex", "Тираннозавр", "Tyrannosaurus rex", 12, "long", "Длиной со школьный автобус."),
    ("orca", "Косатка", "Orcinus orca", 7, "long", "Охотится даже на белых акул."),
    ("giraffe", "Жираф", "Giraffa camelopardalis|Giraffa", 5.5, "tall", "Язык жирафа длиной почти полметра."),
    ("croc", "Гребнистый крокодил", "Crocodylus porosus|Crocodylus", 5, "long", "Самая большая рептилия на планете."),
    ("great_white", "Белая акула", "Carcharodon carcharias", 4.5, "long", "У неё около 300 зубов в несколько рядов."),
    ("rhino", "Белый носорог", "Ceratotherium simum", 3.7, "long", "Рог сделан из того же, что и наши ногти."),
    ("hippo", "Бегемот", "Hippopotamus amphibius", 3.5, "long", "Бегает быстрее человека — до 30 км/ч."),
    ("elephant", "Африканский слон", "Loxodonta africana|Loxodonta", 3.2, "tall", "Самое большое животное на суше."),
    ("tiger", "Тигр", "Panthera tigris", 2.8, "long", "Полоски у каждого тигра свои, как отпечатки пальцев."),
    ("dolphin", "Дельфин-афалина", "Tursiops truncatus", 2.8, "long", "Спит, «выключая» по очереди половинки мозга."),
    ("moose", "Лось", "Alces alces", 2.7, "long", "Самый большой олень в мире."),
    ("ostrich", "Страус", "Struthio camelus", 2.5, "tall", "Выше баскетболиста и бегает до 70 км/ч."),
    ("polar_bear", "Белый медведь", "Ursus maritimus", 2.4, "long", "Кожа у него чёрная, а шерсть прозрачная."),
    ("horse", "Лошадь", "Equus caballus|Equus ferus caballus", 2.4, "long", "Умеет спать стоя."),
    ("lion", "Лев", "Panthera leo", 2.1, "long", "Его рык слышно за 8 километров."),
    ("raptor", "Велоцираптор", "Velociraptor mongoliensis|Velociraptor", 2, "long", "В жизни был размером с индюка, а не с человека!"),
    ("human", "Человек", "Homo sapiens", 1.71, "tall", "Средний взрослый — 1,71 м. Удобный эталон!"),
    ("cheetah", "Гепард", "Acinonyx jubatus", 2.0, "tail", "Разгоняется до 100 км/ч за 3 секунды."),
    ("flamingo", "Фламинго", "Phoenicopterus roseus|Phoenicopterus", 1.3, "tall", "Розовый из-за еды — рачков и водорослей."),
    ("penguin", "Императорский пингвин", "Aptenodytes forsteri", 1.2, "tall", "Ныряет глубже 500 метров."),
    ("capybara", "Капибара", "Hydrochoerus hydrochaeris|Hydrochoerus", 1.2, "long", "Самый большой грызун на Земле. Как Капи!"),
    ("wolf", "Волк", "Canis lupus", 1.6, "tail", "Вой волка слышно за много километров."),
    ("koala", "Коала", "Phascolarctos cinereus", 0.75, "tall", "Спит до 20 часов в сутки."),
    ("fox", "Лиса", "Vulpes vulpes", 1.1, "tail", "Слышит, как мышь шуршит под снегом."),
    ("raccoon", "Енот", "Procyon lotor", 0.9, "tail", "Полощет еду в воде лапками."),
    ("cat", "Кошка", "Felis catus|Felis silvestris catus", 0.46, "long", "Спит около 15 часов в сутки."),
    ("rabbit", "Кролик", "Oryctolagus cuniculus", 0.4, "long", "Зубы у кролика растут всю жизнь."),
    ("hedgehog", "Ёж", "Erinaceus europaeus|Erinaceus", 0.26, "long", "На спине около 5 000 иголок."),
    ("axolotl", "Аксолотль", "Ambystoma mexicanum", 0.23, "long", "Умеет отращивать лапы заново."),
    ("hummingbird", "Колибри", "Archilochus colubris|Trochilidae", 0.09, "long", "Машет крыльями около 50 раз в секунду."),
    ("mouse", "Мышь", "Mus musculus", 0.16, "tail", "Сердце мыши бьётся 600 раз в минуту."),
    ("bee", "Пчела", "Apis mellifera", 0.013, "long", "Ради ложки мёда пчёлы облетают тысячи цветов."),
]


# Вручную выбранные силуэты (вид сбоку), если первый подходящий не годится
PINNED = {
    "whale_shark": "07a435aa-0db6-4054-8854-2db3010c8162",
    "great_white": "545d45f0-0dd1-4cfd-aad6-2b835223ea0d",
    "elephant": "62398ac0-f0c3-48f8-8455-53512a05fbc4",
    "cheetah": "6290407d-2193-4d97-a194-2a7afc8f89c6",
    "koala": "0904270e-b105-46e0-b81f-c4911d47d467",
    "tiger": "2d866913-d59f-4e48-93d8-19a0ce8201cb",
}
# Силуэты «вид сверху»: длину меряем по вертикали
AXIS_H = {"hedgehog", "bee"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "prikin-build/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def build_number():
    return json.loads(get(API + "/"))["build"]


def pick_image(build, name):
    q = urllib.parse.urlencode({"build": build, "filter_name": name.lower(), "embed_items": "true", "page": 0})
    try:
        data = json.loads(get(API + "/images?" + q))
    except Exception:
        return None
    for it in data.get("_embedded", {}).get("items", []):
        links = it["_links"]
        lic = links.get("license", {}).get("href")
        vec = links.get("vectorFile", {})
        if lic in OK_LICENSES and isinstance(vec, dict) and vec.get("href"):
            contributor = links.get("contributor", {}).get("title")
            return {"uuid": it["uuid"], "license": lic, "vector": vec["href"],
                    "attribution": it.get("attribution") or contributor or ""}
    return None


def pinned_image(build, uuid):
    it = json.loads(get(API + "/images/" + uuid + "?build=" + str(build)))
    links = it["_links"]
    lic = links.get("license", {}).get("href")
    if lic not in OK_LICENSES:
        raise SystemExit("лицензия не подходит: " + uuid)
    return {"uuid": uuid, "license": lic, "vector": links["vectorFile"]["href"],
            "attribution": it.get("attribution") or links.get("contributor", {}).get("title") or ""}


def clean_svg(text):
    vb = re.search(r'viewBox="([^"]+)"', text)
    body = re.search(r"<svg[^>]*>(.*)</svg>", text, re.S).group(1)
    body = re.sub(r"<metadata>.*?</metadata>", "", body, flags=re.S)
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    body = re.sub(r'\s(fill|stroke|style)="(?!none)[^"]*"', "", body)
    body = re.sub(r"\s+", " ", body).replace("> <", "><").strip()
    return [float(v) for v in vb.group(1).replace(",", " ").split()], body


def raw():
    sys.stdout.reconfigure(encoding="utf-8")
    build = build_number()
    out = []
    for key, name, latin, size, dim, fact in ANIMALS:
        img = pinned_image(build, PINNED[key]) if key in PINNED else None
        for variant in ([] if img else latin.split("|")):
            img = pick_image(build, variant)
            if img:
                break
            time.sleep(0.2)
        if not img:
            print("НЕТ свободного силуэта:", key, latin)
            continue
        vb, body = clean_svg(get(img["vector"]).decode("utf-8"))
        print("%-12s %6d байт  %s" % (key, len(body), img["license"].split("/")[-3]))
        out.append({"id": key, "name": name, "size": size, "dim": dim, "axis": "h" if dim == "tall" or key in AXIS_H else "w", "fact": fact,
                    "vb": vb, "svg": body, "credit": {"uuid": img["uuid"], "license": img["license"],
                                                      "by": img["attribution"], "latin": latin.split("|")[0]}})
        time.sleep(0.2)
    json.dump(out, open("tools/animals_raw.json", "w", encoding="utf-8"), ensure_ascii=False)


def final(bbox_path, dst):
    sys.stdout.reconfigure(encoding="utf-8")
    items = json.load(open("tools/animals_raw.json", encoding="utf-8"))
    boxes = json.load(open(bbox_path, encoding="utf-8"))
    out, credits = [], []
    for a in items:
        b = boxes[a["id"]]
        a["vb"] = [round(v, 1) for v in b]
        cr = a.pop("credit")
        credits.append("- %s (*%s*) — PhyloPic `%s`, %s%s" % (
            a["name"], cr["latin"], cr["uuid"],
            "CC0" if "zero" in cr["license"] else "Public Domain Mark",
            (", автор: " + cr["by"]) if cr["by"] else ""))
        out.append(a)
    json.dump({"source": "PhyloPic, CC0 / Public Domain", "animals": out},
              open(dst, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    with open("game/content/CREDITS.md", "w", encoding="utf-8") as f:
        f.write("# Источники\n\nКонтуры стран: Natural Earth 1:50m (public domain).\n\n"
                "Силуэты животных: PhyloPic (https://www.phylopic.org), только CC0 и Public Domain:\n\n")
        f.write("\n".join(credits) + "\n")
    print("готово:", dst, len(out), "животных")


if __name__ == "__main__":
    if sys.argv[1] == "raw":
        raw()
    else:
        final(sys.argv[2], sys.argv[3])
