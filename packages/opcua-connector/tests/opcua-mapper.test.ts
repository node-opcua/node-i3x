import { describe, it, expect } from 'vitest';
import { qualifiedNameToNsu, refToSourceNode } from '../src/opcua-mapper.js';
import { NodeClass } from 'node-opcua';

const defaultNamespaceArray = [
    'http://opcfoundation.org/UA/',
    'http://di.org/',
    'http://coffee.com/',
];

describe('qualifiedNameToNsu', () => {
    it('should resolve namespace index to URI and produce nsu string', () => {
        const browseName = { namespaceIndex: 2, name: 'Temperature' } as any;
        const result = qualifiedNameToNsu(browseName, defaultNamespaceArray);
        expect(result).toBe('nsu=http://coffee.com/:Temperature');
    });

    it('should handle namespace index 0 (OPC UA base)', () => {
        const browseName = { namespaceIndex: 0, name: 'Server' } as any;
        const result = qualifiedNameToNsu(browseName, defaultNamespaceArray);
        expect(result).toBe('nsu=http://opcfoundation.org/UA/:Server');
    });

    it('should default to namespace index 0 when namespaceIndex is undefined', () => {
        const browseName = { name: 'Foo' } as any;
        const result = qualifiedNameToNsu(browseName, defaultNamespaceArray);
        expect(result).toBe('nsu=http://opcfoundation.org/UA/:Foo');
    });

    it('should fall back to ns= notation for out-of-range namespace index', () => {
        const browseName = { namespaceIndex: 99, name: 'X' } as any;
        const result = qualifiedNameToNsu(browseName, defaultNamespaceArray);
        expect(result).toBe('nsu=ns=99:X');
    });

    it('should return empty string for null browseName', () => {
        const result = qualifiedNameToNsu(null, defaultNamespaceArray);
        expect(result).toBe('');
    });

    it('should return empty string for undefined browseName', () => {
        const result = qualifiedNameToNsu(undefined, defaultNamespaceArray);
        expect(result).toBe('');
    });

    it('should return empty string when name is empty', () => {
        const browseName = { namespaceIndex: 1, name: '' } as any;
        const result = qualifiedNameToNsu(browseName, defaultNamespaceArray);
        expect(result).toBe('');
    });

    it('should handle special characters in browse name', () => {
        const browseName = { namespaceIndex: 1, name: 'My Variable (°C)' } as any;
        const result = qualifiedNameToNsu(browseName, defaultNamespaceArray);
        expect(result).toBe('nsu=http://di.org/:My Variable (°C)');
    });
});

describe('refToSourceNode', () => {
    function makeRef(overrides: Record<string, any> = {}) {
        return {
            nodeId: { toString: () => 'ns=2;s=MyNode' },
            browseName: {
                namespaceIndex: 2,
                name: 'MyNode',
                toString: () => '2:MyNode',
            },
            displayName: { text: 'My Node' },
            nodeClass: NodeClass.Object,
            typeDefinition: { toString: () => 'ns=0;i=58' },
            ...overrides,
        } as any;
    }

    it('should map an Object node correctly', () => {
        const ref = makeRef({
            nodeClass: NodeClass.Object,
            browseName: {
                namespaceIndex: 2,
                name: 'CoffeeMachine',
                toString: () => '2:CoffeeMachine',
            },
            nodeId: { toString: () => 'ns=2;s=CoffeeMachine' },
            displayName: { text: 'Coffee Machine' },
        });
        const parentSourceNodeId = 'parent-123';

        const result = refToSourceNode(ref, parentSourceNodeId, defaultNamespaceArray);

        expect(result.nodeClass).toBe('Object');
        expect(result.nsuQualifiedName).toBe('nsu=http://coffee.com/:CoffeeMachine');
        expect(result.namespaceUri).toBe('http://coffee.com/');
        expect(result.parentSourceNodeId).toBe('parent-123');
    });

    it('should map a Variable node correctly', () => {
        const ref = makeRef({
            nodeClass: NodeClass.Variable,
            browseName: {
                namespaceIndex: 1,
                name: 'Temperature',
                toString: () => '1:Temperature',
            },
            nodeId: { toString: () => 'ns=1;s=Temperature' },
            displayName: { text: 'Temperature' },
        });
        const parentSourceNodeId = 'parent-456';

        const result = refToSourceNode(ref, parentSourceNodeId, defaultNamespaceArray);

        expect(result.nodeClass).toBe('Variable');
    });

    it('should set parentSourceNodeId to null for root nodes', () => {
        const ref = makeRef();

        const result = refToSourceNode(ref, null, defaultNamespaceArray);

        expect(result.parentSourceNodeId).toBeNull();
    });

    it('should set eventNotifier to true when eventNotifier flag is present', () => {
        const ref = makeRef({
            nodeClass: NodeClass.Object,
            eventNotifier: 1,
        });
        const parentSourceNodeId = 'parent-789';

        const result = refToSourceNode(ref, parentSourceNodeId, defaultNamespaceArray);

        expect(result.eventNotifier).toBe(true);
    });

    it('should extract the correct namespace URI from the nsu name', () => {
        const ref = makeRef({
            browseName: {
                namespaceIndex: 1,
                name: 'DeviceSet',
                toString: () => '1:DeviceSet',
            },
            nodeId: { toString: () => 'ns=1;s=DeviceSet' },
        });
        const parentSourceNodeId = 'parent-abc';

        const result = refToSourceNode(ref, parentSourceNodeId, defaultNamespaceArray);

        expect(result.namespaceUri).toBe('http://di.org/');
        expect(result.nsuQualifiedName).toBe('nsu=http://di.org/:DeviceSet');
    });
});
