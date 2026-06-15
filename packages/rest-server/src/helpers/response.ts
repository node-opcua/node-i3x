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
  },
  parentId: string | null,
): ObjectInstanceResponse {
  return {
    elementId: node.id,
    displayName: node.name,
    typeElementId: node.type ?? '',
    parentId,
    isComposition: node.children.length > 0,
    isExtended: false,
    metadata: {
      typeNamespaceUri: node.namespaceUri ?? null,
      sourceTypeId: node.sourceNodeId ?? null,
    },
  };
}
