import ReactForceGraph3d from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import AsyncSelect from "react-select/async";
import { zip } from "lodash";
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

const removeParens = (text: string): string => {
  let result = "";
  let level = 0;
  let inLink = false;
  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    if (level == 0 && char == "[" && i < text.length && text[i + 1] == "[") {
      inLink = true;
    }

    if (inLink) {
      if (char == "]" && i > 0 && text[i - 1] == "]") {
        inLink = false;
      }
      result += char;
      continue;
    }

    if (char == "(") {
      level++;
    } else if (char == ")") {
      level--;
    }
    if (level === 0) {
      result += char;
    }
  }

  return result;
};

const extractLink = (text: string): string => {
  const linkRegex = new RegExp(/\[\[([^:\]]+?)\]\]/g);
  const matches = linkRegex.exec(text);
  if (matches?.length) {
    const match = matches[1];
    const link = match.split("|")[0];
    return link;
  }
  return "";
};

const trimStart = (text: string): string => {
  const lines = text.split("\n");
  const alphanumericRegex = new RegExp(/[a-zA-Z0-9']/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length && alphanumericRegex.exec(lines[i][0])?.length) {
      return lines.slice(i).join("\n");
    }
  }
  return "";
};

export const Graph = () => {
  const [nodes, setNodes] = useState<Map<string, Node>>(new Map());
  const [links, setLinks] = useState<Link[]>([]);

  const addNode = async (id: string) => {
    const pageTextRes = await fetch(
      `https://en.wikipedia.org/w/api.php?format=json&action=query&prop=revisions&titles=${id}&rvprop=content&rvsection=0&rvslots=*&origin=*&redirects=1`
    );
    const pageText = await pageTextRes.json();
    const pages = pageText.query.pages;
    let wikitext = pages[Object.keys(pages)[0]].revisions[0].slots.main[
      "*"
    ] as string;
    console.log(wikitext);
    wikitext = removeParens(trimStart(wikitext));

    const link = extractLink(wikitext);
    if (link.length) {
      if (id.toLowerCase() != "philosophy") {
        if (!nodes.has(link)) {
          nodes.set(link, { id: link });
          setNodes(new Map(nodes));
          setLinks((links) => [...links, { source: id, target: link }]);
          addNode(link);
        } else {
          setLinks((links) => [...links, { source: id, target: link }]);
        }
      }
    }
  };

  return (
    <>
      <AsyncSelect<DropdownItem>
        cacheOptions
        defaultOptions={[]}
        loadOptions={findArticles}
        onChange={async (e) => {
          if (e?.value) {
            if (!nodes.has(e.value)) {
              nodes.set(e.value, { id: e.value });
              setNodes(new Map(nodes));
              await addNode(e.value);
            }
          }
        }}
      />
      <ReactForceGraph3d
        graphData={{ nodes: Array.from(nodes.values()), links }}
        nodeAutoColorBy="group"
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
