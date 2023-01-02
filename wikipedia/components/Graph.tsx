import ReactForceGraph3d from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import AsyncSelect from "react-select/async";
import { useState } from "react";
import { useResizeDetector } from "react-resize-detector";

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

const cleanExtraLinks = (linkKind: string, text: string): string => {
  let result = "";
  let level = 0;

  let i = 0;
  while (i < text.length) {
    if (text.slice(i, i + 2 + linkKind.length) == "[[" + linkKind) {
      i += 2 + linkKind.length;
      level++;
    } else if (level > 0 && text.slice(i, i + 2) == "[[") {
      i += 2;
      level++;
    } else if (
      level > 0 &&
      i < text.length - 1 &&
      text[i] == "]" &&
      text[i + 1] == "]"
    ) {
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

const cleanComments = (text: string) => {
  const commentRegex = new RegExp(/<!--((?!<--).)*?-->/gs);
  return text.replaceAll(commentRegex, "");
};

const extractLinks = async (
  text: string,
  maxLinks: number
): Promise<WikiLink[]> => {
  const linkRegex = new RegExp(/\[\[([^\]]+?)\]\]/g);
  let links = [];
  let matches;
  while (links.length < maxLinks && (matches = linkRegex.exec(text))) {
    const match = matches[1];
    const link = match.split("|")[0];
    const wikilink = await getLink(link, 0);
    if (wikilink) {
      links.push(wikilink);
    }
  }
  return links;
};

const trimStart = (text: string): string => {
  const lines = text.split("\n");
  const allowedLineStartRegex = new RegExp(/[a-zA-Z0-9'"]/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.length &&
      !line.endsWith("<br>") &&
      ((allowedLineStartRegex.exec(line[0])?.length ?? 0 > 0) ||
        line.startsWith("[["))
    ) {
      return lines.slice(i).join("\n");
    }
  }
  return "";
};

const sleep = (millis: number) => new Promise((p) => setTimeout(p, millis));

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
  if (!pages) {
    return undefined;
  }
  const page = pages[Object.keys(pages)[0]];
  if (!page.revisions) {
    return undefined;
  }
  let wikitext = page.revisions[0].slots.main["*"] as string;
  // Redirect should take precedence over normalized
  if (pageText?.query?.redirects) {
    return { id: pageText.query.redirects[0].to, wikitext };
  }
  if (pageText?.query?.normalized) {
    return { id: pageText.query.normalized[0].to, wikitext };
  }

  return { id, wikitext };
};

export const Graph = () => {
  const [nodeMap, setNodeMap] = useState<Map<string, Node>>(new Map());
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(false);
  const [numLinks, setNumLinks] = useState(1);
  const { width, height, ref } = useResizeDetector();

  const addNode = async (article: WikiLink, section: number) => {
    debugger;
    let wikitext = article.wikitext;
    wikitext = cleanComments(wikitext);
    wikitext = cleanBlocks(wikitext);
    wikitext = cleanParens(wikitext);
    wikitext = cleanExtraLinks("File:", wikitext);
    wikitext = cleanExtraLinks("Image:", wikitext);
    wikitext = cleanExtraLinks("#", wikitext);
    if (section === 0) {
      wikitext = trimStart(wikitext);
    }

    const links = await extractLinks(wikitext, numLinks);
    if (links.length === 0) {
      const wikilink = await getLink(article.id, section + 1);
      if (wikilink) {
        await addNode(wikilink, section + 1);
      }
    }

    for (let link of links) {
      if (link.id.length) {
        setLoading(true);
        await sleep(100);
        if (!nodeMap.has(link.id)) {
          nodeMap.set(link.id, { id: link.id });
          setNodeMap(new Map(nodeMap));
          setLinks((links) => [
            ...links,
            { source: article.id, target: link.id },
          ]);
          await addNode(link, 0);
          return;
          // if (link.id != "Philosophy") {
          //   addNode(link, 0);
          // } else {
          //   setLoading(false);
          // }
        } else {
          setLinks((links) => [
            ...links,
            { source: article.id, target: link.id },
          ]);
          setLoading(false);
        }
      }
    }
  };

  return (
    <div style={{ height: "96vh" }} ref={ref}>
      <input
        type="number"
        style={{ width: "25px", marginRight: "5px" }}
        value={numLinks}
        onChange={(e) => setNumLinks(parseInt(e.target.value))}
      />
      <button
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const randomTitle = await loadRandomTitle();
          console.log("RANDOM", randomTitle);
          const wikilink = await getLink(randomTitle, 0);
          if (wikilink) {
            if (!nodeMap.has(wikilink?.id)) {
              nodeMap.set(randomTitle, { id: wikilink.id });
              setNodeMap(new Map(nodeMap));

              await addNode(wikilink, 0);
            }
          }
        }}
      >
        Random
      </button>
      <button
        onClick={() => {
          setNodeMap(new Map());
          setLinks([]);
        }}
      >
        Clear
      </button>
      <AsyncSelect<DropdownItem>
        cacheOptions
        defaultOptions={[]}
        loadOptions={findArticles}
        onChange={async (e) => {
          if (e?.value) {
            const wikilink = await getLink(e.value, 0);
            if (wikilink) {
              if (!nodeMap.has(wikilink.id)) {
                nodeMap.set(wikilink.id, { id: wikilink.id });
                setNodeMap(new Map(nodeMap));

                await addNode(wikilink, 0);
              }
            }
          }
        }}
      />

      <ReactForceGraph3d
        width={width}
        height={height ? height - 75 : undefined}
        graphData={{ nodes: Array.from(nodeMap.values()), links }}
        nodeAutoColorBy="group"
        linkDirectionalArrowLength={6}
        linkCurvature={0}
        numDimensions={2}
        nodeThreeObject={(node: { id: string | undefined; color: string }) => {
          const sprite = new SpriteText(node.id);
          sprite.color = node.color;
          sprite.textHeight = 8;
          sprite.backgroundColor = "rgba(50,50,50,0.8)";
          sprite.borderRadius = 10;
          sprite.padding = 5;
          return sprite;
        }}
      />
    </div>
  );
};
