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
  for (let char of text) {
    if (char == "(") {
      level++;
    } else if (char == ")") {
      level--;
    }
    if (level === 0) {
      result += char;
    }
  }
  console.log(result);
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

export const Graph = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);

  return (
    <>
      <AsyncSelect<DropdownItem>
        cacheOptions
        defaultOptions={[]}
        loadOptions={findArticles}
        onChange={async (e) => {
          if (e?.value) {
            setNodes((nodes) => [...nodes, { id: e.value }]);
            const pageTextRes = await fetch(
              `https://en.wikipedia.org/w/api.php?format=json&action=query&prop=revisions&titles=${e.value}&rvprop=content&rvsection=0&rvslots=*&origin=*&redirects=1`
            );
            const pageText = await pageTextRes.json();
            const pages = pageText.query.pages;
            let wikitext = pages[Object.keys(pages)[0]].revisions[0].slots.main[
              "*"
            ] as string;
            wikitext = removeParens(wikitext.split("\n\n")[1]);

            const link = extractLink(wikitext);
            if (link.length) {
              setNodes((nodes) => [...nodes, { id: link }]);
              setLinks((links) => [
                ...links,
                { source: e.value, target: link },
              ]);
            }
          }
        }}
      />
      <ReactForceGraph3d
        graphData={{ nodes, links }}
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
