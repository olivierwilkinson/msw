import {
  DefinitionNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLSchema,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
  GraphQLNamedType,
} from 'graphql'
import { collectFields } from 'graphql/execution/collectFields'

const dummySchema = new GraphQLSchema({})

// use leading underscores because they are reserved for internal gql variables
const anonymousOperationKey = '__anonymous_operation'

function isFragmentDefinition(
  definition: DefinitionNode,
): definition is FragmentDefinitionNode {
  return definition.kind === Kind.FRAGMENT_DEFINITION
}

function isOperationDefinition(
  definition: DefinitionNode,
): definition is OperationDefinitionNode {
  return definition.kind === Kind.OPERATION_DEFINITION
}

function extractDefinitions(documentNode: DocumentNode): {
  fragments: Record<string, FragmentDefinitionNode>
  operations: Record<string, OperationDefinitionNode>
} {
  const { definitions } = documentNode

  const fragments: Record<string, FragmentDefinitionNode> = {}
  definitions.filter(isFragmentDefinition).forEach((definition) => {
    fragments[definition.name.value] = definition
    return fragments
  })

  const operations: Record<string, OperationDefinitionNode> = {}
  definitions.filter(isOperationDefinition).forEach((definition) => {
    const operationName = definition.name?.value || anonymousOperationKey
    operations[operationName] = definition
  })

  return {
    fragments,
    operations,
  }
}

const pickField = ({
  fieldPath,
  fieldNode,
  fieldData,
  schema,
  fragments,
  variables,
}: {
  fieldPath: string
  fieldNode: FieldNode
  fieldData: any
  schema: GraphQLSchema
  fragments: Record<string, FragmentDefinitionNode>
  variables: Record<string, unknown>
}) => {
  if (
    fieldNode.selectionSet &&
    typeof fieldData === 'object' &&
    fieldData !== null
  ) {
    // infer runtime type using __typename for conditional fragment picking
    const runtimeObject =
      typeof fieldData.__typename === 'string'
        ? schema.getType(fieldData.__typename)
        : undefined

    if (schema !== dummySchema && !runtimeObject) {
      throw new Error(
        `Unable to infer object type. Ensure "${fieldPath}" includes __typename.`,
      )
    }

    return pickSelectionSet({
      path: fieldPath,
      data: fieldData,
      selectionSet: fieldNode.selectionSet,
      schema,
      fragments,
      variables,
      runtimeObject,
    })
  }

  return fieldData
}

function pickSelectionSet({
  path = 'data',
  data,
  selectionSet,
  schema,
  fragments,
  variables = {},
  runtimeObject,
}: {
  path?: string
  data: Record<string, any>
  selectionSet: SelectionSetNode
  schema: GraphQLSchema
  fragments: Record<string, FragmentDefinitionNode>
  variables?: Record<string, unknown>
  runtimeObject?: GraphQLNamedType
}): Record<string, unknown> {
  const fieldMap = collectFields(
    schema,
    fragments,
    variables,
    // @ts-expect-error runtime object can be undefined if using dummySchema
    runtimeObject,
    selectionSet,
  )

  const pick = (fieldNode: FieldNode, fieldData: any, fieldPath: string) =>
    pickField({
      fieldNode,
      fieldData,
      schema,
      fragments,
      variables,
      fieldPath,
    })

  const pickedData: Record<string, unknown> = {}

  Array.from(fieldMap.values()).forEach((fieldNodes) => {
    fieldNodes.forEach((fieldNode) => {
      const fieldData = data[fieldNode.name.value]

      pickedData[fieldNode.name.value] = Array.isArray(fieldData)
        ? fieldData.map((fieldItemData: any, i) =>
            pick(
              fieldNode,
              fieldItemData,
              `${path}.${fieldNode.name.value}[${i}]`,
            ),
          )
        : pick(fieldNode, fieldData, `${path}.${fieldNode.name.value}`)
    })
  })

  return pickedData
}

/*
- Assumes document has been validated beforehand and contains valid operation.

- When using dummy schema custom directives and conditional fragments cannot be
evaluated; conditional fragments are combined and all fields are picked.

- When using real schema custom directives and conditional fragments can be
evaluated, but objects with selection sets must include __typename for type
inference.
*/
export default function pickOperationFields(
  data: Record<string, any>,
  documentNode: DocumentNode,
  operationName: string | null,
  variables?: Record<string, unknown>,
  schema: GraphQLSchema = dummySchema,
): Record<string, any> {
  const { fragments, operations } = extractDefinitions(documentNode)
  const operation = operations[operationName || anonymousOperationKey]

  if (!operation) {
    throw new Error(
      operationName
        ? `Unable to find operation named "${operationName}"`
        : `Unable to find anonymous query, pass operationName to choose an operation`,
    )
  }

  return pickSelectionSet({
    data,
    selectionSet: operation.selectionSet,
    schema,
    fragments,
    variables,
    runtimeObject: schema.getRootType(operation.operation) || undefined,
  })
}
