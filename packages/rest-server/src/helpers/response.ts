// -----------------------------------------------------------------
// @node-i3x/rest-server -- Response envelope helpers
//
// Use these instead of hand-building { success, result/results }
// to ensure compliance with the i3X OpenAPI spec.
// -----------------------------------------------------------------

/** ErrorDetail as defined in the i3X spec. */
export interface ErrorDetail {
  readonly title: string;
  readonly status: number;
  readonly detail: string;
}

/** SuccessResponse<T> -- wraps a single result. */
export interface SuccessResponse<T> {
  readonly success: true;
  readonly result: T;
}

/** BulkResultItem<T> -- one item in a bulk response. */
export interface BulkResultItem<T> {
  readonly success: boolean;
  readonly elementId?: string | null;
  readonly subscriptionId?: string | null;
  readonly result?: T | null;
  readonly responseDetail?: ErrorDetail | null;
}

/** BulkResponse<T> -- wraps multiple bulk result items. */
export interface BulkResponse<T> {
  readonly success: boolean;
  readonly results: BulkResultItem<T>[];
}

/** ObjectInstanceResponse as defined in the i3X spec. */
export interface ObjectInstanceResponse {
  readonly elementId: string;
  readonly displayName: string;
  readonly typeElementId: string;
  readonly parentId?: string | null;
  readonly isComposition: boolean;
  readonly isExtended: boolean;
  readonly metadata?: ObjectInstanceMetadata | null;
}

/** ObjectInstanceMetadata as defined in the i3X spec. */
export interface ObjectInstanceMetadata {
  readonly typeNamespaceUri?: string | null;
  readonly sourceTypeId?: string | null;
  readonly description?: string | null;
  readonly relationships?: Record<string, unknown> | null;
  readonly schemaExtensions?: Record<string, unknown> | null;
  readonly system?: Record<string, unknown> | null;
}

/** RelatedObjectResult as defined in the i3X spec. */
export interface RelatedObjectResult {
  readonly sourceRelationship: string;
  readonly object: ObjectInstanceResponse;
}

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
