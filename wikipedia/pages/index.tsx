import dynamic from "next/dynamic";

const Index = dynamic(
  async () => {
    return (await import("../components/Graph")).ForceGraph;
  },
  { ssr: false, loading: () => <>Loading...</> }
);

export default Index;
