import ReactForceGraph2d from "react-force-graph-2d";
import AsyncSelect from "react-select/async";
import { useState } from "react";
import { useResizeDetector } from "react-resize-detector";

interface Node {
  id: string;
}

interface Link {
  source: Node;
  target: Node;
}

interface DropdownItem {
  label: string;
  value: string;
}

interface WikiLink {
  id: string;
  wikitext: string;
}

class Graph {
  nodes: Node[];
  links: Link[];
  nodeMap: Map<string, { node: Node; rank: number }>;

  constructor(source: Graph | undefined = undefined) {
    if (source) {
      this.nodes = [...source.nodes];
      this.links = [...source.links];
      this.nodeMap = new Map(source.nodeMap);
    } else {
      this.nodes = [];
      this.links = [];
      this.nodeMap = new Map();
    }
  }

  addNode(id: string) {
    if (!this.nodeMap.has(id)) {
      const node = { id };
      this.nodes.push(node);
      this.nodeMap.set(id, { node, rank: 0 });
    }
  }

  has(id: string): boolean {
    return this.nodeMap.has(id);
  }

  addLink(sourceId: string, targetId: string) {
    this.links.push({
      source: this.nodeMap.get(sourceId)!.node,
      target: this.nodeMap.get(targetId)!.node,
    });

    this.updateLink(targetId, new Set());
  }

  updateLink(targetId: string, visited: Set<string>) {
    if (visited.has(targetId)) {
      return;
    }
    this.nodeMap.get(targetId)!.rank++;
    visited.add(targetId);
    for (let link of this.links.filter((l) => l.source.id == targetId)) {
      this.updateLink(link.target.id, visited);
    }
  }
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

const extractLinks = async function* (text: string, maxLinks: number) {
  const linkRegex = new RegExp(/\[\[([^\]]+?)\]\]/g);
  let matches;
  let linksFound = 0;
  while (linksFound < maxLinks && (matches = linkRegex.exec(text))) {
    const match = matches[1];
    const link = match.split("|")[0];
    const wikilink = await getLink(link, 0);
    if (wikilink) {
      yield wikilink;
      linksFound++;
    }
  }
};

const trimStart = (text: string): string => {
  const lines = text.split("\n").map((t) => t.trim());
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

export const ForceGraph = () => {
  const [graph, setGraph] = useState(new Graph());
  const [loading, setLoading] = useState(false);
  const [numLinks, setNumLinks] = useState(1);
  const { width, height, ref } = useResizeDetector();

  const addNode = async (article: WikiLink, section: number) => {
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

    let linkFound = false;

    for await (let link of extractLinks(wikitext, numLinks)) {
      linkFound = true;
      setLoading(true);
      if (!graph.has(link.id)) {
        graph.addNode(link.id);
        graph.addLink(article.id, link.id);
        setGraph(new Graph(graph));

        await addNode(link, 0);
        return;
      } else {
        graph.addLink(article.id, link.id);
        setGraph(new Graph(graph));
      }
    }

    if (!linkFound) {
      const wikilink = await getLink(article.id, section + 1);
      if (wikilink) {
        await addNode(wikilink, section + 1);
      }
    }
    setLoading(false);
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
            if (!graph.has(wikilink?.id)) {
              graph.addNode(wikilink.id);
              setGraph(new Graph(graph));

              await addNode(wikilink, 0);
            }
          }
        }}
      >
        Random
      </button>
      <button
        onClick={() => {
          setGraph(new Graph());
        }}
      >
        Clear
      </button>
      <AsyncSelect<DropdownItem>
        cacheOptions
        defaultOptions={[]}
        loadOptions={findArticles}
        onChange={async (e) => {
          debugger;
          if (e?.value) {
            const wikilink = await getLink(e.value, 0);
            if (wikilink) {
              if (!graph.has(wikilink.id)) {
                graph.addNode(wikilink.id);
                setGraph(new Graph(graph));
              }
              await addNode(wikilink, 0);
            }
          }
        }}
      />

      <ReactForceGraph2d
        width={width}
        height={height ? height - 75 : undefined}
        graphData={graph}
        backgroundColor="black"
        linkColor={() => "#bfced6"}
        linkDirectionalArrowColor={() => "#bfced6"}
        linkDirectionalArrowLength={6}
        linkCurvature={0.1}
        enableNodeDrag={false}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = (node.id ?? "") as string;
          const multiplier = 1 + graph.nodeMap.get(label)!.rank * 0.01;
          const fontSize = Math.min(12 / globalScale, 24);
          ctx.font = `${fontSize}px Sans-Serif`;

          const textWidth = ctx.measureText(label).width;

          ctx.beginPath();
          ctx.ellipse(
            node.x ?? 0,
            node.y ?? 0,
            (textWidth / 2) * multiplier + 5,
            fontSize * multiplier,
            0,
            0,
            2 * Math.PI
          );
          const color = 50 + graph.nodeMap.get(label)!.rank * 1.5;

          ctx.fillStyle = `rgba(${color},${color},${color},0.8)`;

          ctx.fill();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const textColor = 255 - color;
          ctx.fillStyle = `rgb(${textColor},${textColor},${textColor})`;

          ctx.fillText(label, node.x ?? 0, node.y ?? 0);
        }}
        nodePointerAreaPaint={(node, paintColor, ctx, globalScale) => {
          const label = (node.id ?? "") as string;
          const textWidth = ctx.measureText(label).width;
          const fontSize = Math.min(12 / globalScale, 24);
          ctx.fillRect(node.x ?? 0, node.y ?? 0, textWidth, fontSize);
        }}
      />
    </div>
  );
};
