export interface XmlNode {
    name: string;
    attributes: Record<string, string>;
    children: XmlNode[];
    text: string;
}
/** A deliberately small, non-validating XML reader: external entities and DTDs are rejected. */
export declare function parseXml(xml: string, maxNodes?: number): XmlNode;
export declare function descendants(node: XmlNode, name: string): XmlNode[];
export declare function firstDescendant(node: XmlNode, name: string): XmlNode | undefined;
export declare function directChildren(node: XmlNode, name: string): XmlNode[];
export declare function textContent(node: XmlNode): string;
//# sourceMappingURL=xml.d.ts.map