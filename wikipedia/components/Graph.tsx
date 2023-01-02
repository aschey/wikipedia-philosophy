import ReactForceGraph3d from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import AsyncSelect from "react-select/async";
import { useState } from "react";

interface Node {
  id: string;
}

interface Link {
  source: string;
  target: string;
}

interface DropdownItem {
  label: string;
  value: string;
}

interface WikiLink {
  id: string;
  wikitext: string;
}

const loadRandomTitle = async (): Promise<string> => {
  const res = await fetch(
    "https://en.wikipedia.org/w/api.php?format=json&action=query&prop=revisions&list=random&rvprop=content&rvsection=0&rvslots=main&origin=*&redirects=1&rnnamespace=0"
  );
  const data = await res.json();
  return data.query.random[0].title as string;
};

const findArticles = async (inputValue: string): Promise<DropdownItem[]> => {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${inputValue}&limit=5&format=json&origin=*`
  );
  const data = await res.json();
  return (data[1] as string[]).map((title) => ({
    label: title,
    value: title,
  }));
};

const cleanParens = (text: string): string => {
  let result = "";
  let level = 0;
  let linkLevel = 0;
  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    if (level == 0 && char == "[" && i < text.length && text[i + 1] == "[") {
      linkLevel++;
    }

    if (linkLevel > 0) {
      if (i > 1 && text[i - 1] == "]" && text[i - 2] == "]") {
        linkLevel--;
      }
    }

    if (linkLevel == 0) {
      if (char == "(") {
        level++;
      } else if (i > 0 && text[i - 1] == ")") {
        level--;
      }
    }

    if (level === 0 || linkLevel > 0) {
      result += char;
    }
  }

  return result;
};

const cleanBlocks = (text: string): string => {
  let result = "";
  let level = 0;

  let i = 0;
  while (i < text.length) {
    if (i < text.length - 1 && text[i] == "{" && text[i + 1] == "{") {
      i += 2;
      level++;
    } else if (i < text.length - 1 && text[i] == "}" && text[i + 1] == "}") {
      i += 2;
      level--;
    } else {
      if (level == 0) {
        result += text[i];
      }
      i++;
    }
  }

  return result;
};

const extractLink = async (text: string): Promise<WikiLink> => {
  const linkRegex = new RegExp(/\[\[([^\]]+?)\]\]/g);
  let matches;
  while ((matches = linkRegex.exec(text))) {
    const match = matches[1];
    const link = match.split("|")[0];
    const wikilink = await getLink(link, 0);
    if (wikilink) {
      return wikilink;
    }
  }
  return { id: "", wikitext: "" };
};

const trimStart = (text: string): string => {
  const lines = text.split("\n");
  const alphanumericRegex = new RegExp(/[a-zA-Z0-9'"]/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.length &&
      !line.endsWith("<br>") &&
      ((alphanumericRegex.exec(line[0])?.length ?? 0 > 0) ||
        (line.startsWith("[[") &&
          !line.startsWith("[[File:") &&
          !line.startsWith("[[Image:")))
    ) {
      return lines.slice(i).join("\n");
    }
  }
  return "";
};

const getLink = async (
  id: string,
  section: number
): Promise<WikiLink | undefined> => {
  id = id.split("#")[0];
  const pageTextRes = await fetch(
    `https://en.wikipedia.org/w/api.php?format=json&action=query&prop=revisions&titles=${id}&rvprop=content&rvsection=${section}&rvslots=*&origin=*&redirects=1`
  );
  const pageText = await pageTextRes.json();
  const pages = pageText.query.pages;
  const page = pages[Object.keys(pages)[0]];
  if (!page.revisions) {
    return undefined;
  }
  let wikitext = page.revisions[0].slots.main["*"] as string;
  if (pageText?.query?.normalized) {
    return { id: pageText.query.normalized[0].to, wikitext };
  }
  if (pageText?.query?.redirects) {
    return { id: pageText.query.redirects[0].to, wikitext };
  }
  return { id, wikitext };
};

export const Graph = () => {
  const [nodes, setNodes] = useState<Map<string, Node>>(new Map());
  const [links, setLinks] = useState<Link[]>([]);

  const addNode = async (article: WikiLink, section: number) => {
    debugger;
    let wikitext = cleanParens(cleanBlocks(article.wikitext));
    if (section === 0) {
      wikitext = trimStart(wikitext);
    }

    const link = await extractLink(wikitext);
    if (!link.id.length) {
      const wikilink = await getLink(article.id, section + 1);
      if (wikilink) {
        await addNode(wikilink, section + 1);
      }
    }

    if (link.id.length) {
      if (!nodes.has(link.id)) {
        nodes.set(link.id, { id: link.id });
        setNodes(new Map(nodes));
        setLinks((links) => [
          ...links,
          { source: article.id, target: link.id },
        ]);
        if (link.id != "Philosophy") {
          addNode(link, 0);
        }
      } else {
        setLinks((links) => [
          ...links,
          { source: article.id, target: link.id },
        ]);
      }
    }
  };

  return (
    <>
      <button
        onClick={async () => {
          const randomTitle = await loadRandomTitle();
          console.log("RANDOM", randomTitle);
          if (!nodes.has(randomTitle)) {
            nodes.set(randomTitle, { id: randomTitle });
            setNodes(new Map(nodes));
            const wikilink = await getLink(randomTitle, 0);
            if (wikilink) {
              await addNode(wikilink, 0);
            }
          }
        }}
      >
        Random
      </button>
      <AsyncSelect<DropdownItem>
        cacheOptions
        defaultOptions={[]}
        loadOptions={findArticles}
        onChange={async (e) => {
          if (e?.value) {
            if (!nodes.has(e.value)) {
              nodes.set(e.value, { id: e.value });
              setNodes(new Map(nodes));
              const wikilink = await getLink(e.value, 0);
              if (wikilink) {
                await addNode(wikilink, 0);
              }
            }
          }
        }}
      />
      <ReactForceGraph3d
        graphData={{ nodes: Array.from(nodes.values()), links }}
        nodeAutoColorBy="group"
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.1}
        //  numDimensions={2}
        nodeThreeObject={(node: { id: string | undefined; color: string }) => {
          const sprite = new SpriteText(node.id);
          sprite.color = node.color;
          sprite.textHeight = 8;
          return sprite;
        }}
      />
    </>
  );
};
