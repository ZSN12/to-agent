export interface XmlNode {
    name: string;
    attributes: Record<string, string>;
    children: XmlNode[];
    text: string;
}
export interface XmlVisitor {
    start(name: string, attributes: Record<string, string>): void;
    text(value: string): void;
    end(name: string): void;
}
/** A deliberately small, non-validating XML reader: external entities and DTDs are rejected. */
export declare function parseXml(xml: string, maxNodes?: number): XmlNode;
/**
 * Validate XML and deliver SAX-style events without retaining a document tree.
 * Large worksheet parts can contain millions of cells, so building one object
 * per XML tag would defeat the parser worker's memory ceiling.
 */
export declare function walkXml(xml: string, visitor: XmlVisitor, maxNodes?: number): void;
export declare function descendants(node: XmlNode, name: string): XmlNode[];
export declare function firstDescendant(node: XmlNode, name: string): XmlNode | undefined;
export declare function directChildren(node: XmlNode, name: string): XmlNode[];
export declare function textContent(node: XmlNode): string;
//# sourceMappingURL=xml.d.ts.map