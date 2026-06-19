// -----------------------------------------------------------------
// @node-i3x/rest-server -- Response envelope helpers
//
// Use these instead of hand-building { success, result/results }
// to ensure compliance with the i3X OpenAPI spec.
// -----------------------------------------------------------------

import type {
  BulkResponse,
  BulkResultItem,
  ObjectInstanceResponse,
  ObjectType,
  SuccessResponse,
} from '@node-i3x/core';

// -- Factory helpers --

export function successResponse<T>(result: T): SuccessResponse<T> {
  return { success: true, result };
}

export function bulkResponse<T>(results: BulkResultItem<T>[]): BulkResponse<T> {
  const success = results.every((r) => r.success);
  return { success, results };
}

export function bulkSuccess<T>(elementId: string, result: T): BulkResultItem<T> {
  return { success: true, elementId, result };
}

export function bulkError<T>(
  elementId: string,
  statusCode: number,
  message: string,
  title?: string,
): BulkResultItem<T> {
  return {
    success: false,
    elementId,
    responseDetail: {
      title: title ?? 'Error',
      status: statusCode,
      detail: message,
    },
  };
}

/**
 * Project a ModelNode into an ObjectInstanceResponse.
 *
 * Centralises the mapping so routes never build this shape
 * by hand (DRY).
 */
export function toObjectInstance(
  node: {
    id: string;
    name: string;
    type?: string | null;
    children: readonly string[];
    namespaceUri?: string;
    sourceNodeId?: string;
    engUnit?: string | null;
  },
  parentId: string | null,
  includeMetadata?: boolean,
  typeMap?: ReadonlyMap<string, ObjectType>,
): ObjectInstanceResponse {
  let typeNamespaceUri: string | null = null;
  let sourceTypeId: string | null = null;

  if (includeMetadata) {
    const typeElementId = node.type || 'UnknownType';
    const typeInfo = typeMap?.get(typeElementId);
    if (typeInfo) {
      typeNamespaceUri = typeInfo.namespaceUri;
      sourceTypeId = typeInfo.sourceTypeId;
    } else {
      typeNamespaceUri = node.namespaceUri ?? null;
      sourceTypeId = node.sourceNodeId ?? null;
    }
  }

  return {
    elementId: node.id,
    displayName: node.name,
    typeElementId: node.type ?? '',
    parentId,
    isComposition: node.children.length > 0,
    isExtended: false,
    ...(includeMetadata
      ? {
          metadata: {
            typeNamespaceUri,
            sourceTypeId,
            engUnit: node.engUnit ?? null,
          },
        }
      : {}),
  };
}
