declare module "react-cytoscapejs" {
  import { Component } from "react";
  import { Core, ElementDefinition } from "cytoscape";

  interface CytoscapeComponentProps {
    id?: string;
    elements: ElementDefinition[];
    style?: React.CSSProperties;
    stylesheet?: any;
    className?: string;
    cy?: (cy: Core) => void;
    layout?: any;
    [key: string]: any;
  }

  export default class CytoscapeComponent extends Component<CytoscapeComponentProps> {}
}
