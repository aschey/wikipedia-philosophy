from bs4 import BeautifulSoup
from neo4j import GraphDatabase
import requests
import random
import time


def create_node(name):
    write_graph("CREATE (a:Article { name: $name, hits: 1 })", name=name)


def create_link(name1, name2):
    write_graph(
        "MATCH (a:Article),(b:Article) WHERE a.name = $name1 AND b.name = $name2 CREATE (a)-[r:links]->(b)",
        name1=name1,
        name2=name2,
    )


def increment(name):
    write_graph("MATCH (a:Article { name: $name }) SET a.hits = a.hits + 1", name=name)


def node_exists(name):
    articles = read_graph("MATCH (a: Article { name: $name }) RETURN a.id", name=name)
    return len(articles) > 0


def write_graph(statement, **kwargs):
    driver = GraphDatabase.driver("bolt://localhost:7687")
    with driver.session() as session:
        func = lambda tx, **kw: tx.run(statement, **kw)
        session.write_transaction(func, **kwargs)


def do_cypher_tx(tx, cypher, **kwargs):
    result = tx.run(cypher, **kwargs)
    values = []
    for record in result:
        values.append(record.values())
    return values


def read_graph(statement, **kwargs):
    driver = GraphDatabase.driver("bolt://localhost:7687")
    with driver.session() as session:
        res = session.read_transaction(do_cypher_tx, statement, **kwargs)
        return res


def remove_parens(string: str):
    o_parens = 0
    c_parens = 0
    start_index = -1
    o_quote_found = False
    ignore = False
    for i, letter in enumerate(string):
        if i < len(string) - 5 and string[i : i + 5] == "href=":
            ignore = True
        if ignore and letter == '"':
            if o_quote_found:
                ignore = False
            o_quote_found = not o_quote_found
        if ignore:
            continue

        if letter == "(":
            o_parens += 1
            if start_index == -1:
                start_index = i
        elif letter == ")":
            c_parens += 1
        if o_parens > 0 and o_parens == c_parens:
            return remove_parens(string[0:start_index] + string[i + 1 :])
    return string


def find_links(elements, exclude_italics):
    for p in elements:
        p = BeautifulSoup(remove_parens(str(p)), "lxml")
        anchors = p.find_all("a")
        for a in anchors:
            href = a["href"]
            if (
                "redlink=1" in href
                or "wiktionary" in href
                or "cite_note" in href
                or "/Help:" in href
                or "/Template:" in href
                or (a.parent.name == "i" and exclude_italics)
            ):
                continue

            return "https://en.wikipedia.org" + href
    return None


def find_link(link: str, prev: str = None, hops: int = 0):
    time.sleep(random.random())
    res = requests.get(link)
    soup = BeautifulSoup(res.content, "lxml")
    title = soup.title.text.replace(" - Wikipedia", "")
    print(title)
    if node_exists(title):
        increment(title)
        if prev != None:
            create_link(prev, title)
        return
    else:
        create_node(title)
    if prev != None:
        create_link(prev, title)
    output = soup.find("div", {"class": "mw-parser-output"})
    paragraphs = output.find_all("p", recursive=False)
    link = find_links(paragraphs, True)
    if link == None:
        uls = output.find_all("ul", recursive=False)
        link = find_links(uls, False)
    if link == None:
        return
    if link.endswith("/wiki/Philosophy"):
        create_link(title, "Philosophy")
        increment("Philosophy")
        return hops + 1
    return find_link(link, title, hops + 1)


if not node_exists("Philosophy"):
    create_node("Philosophy")

# for i in range(100):
#     print(find_link("https://en.wikipedia.org/wiki/Special:Random"))
find_link("https://en.wikipedia.org/wiki/Thanakhan_Chaiyasombat")
