import {
  DefinitionNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLSchema,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
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

const pickField = (
  fieldNode: FieldNode,
  fieldData: any,
  fragments: Record<string, FragmentDefinitionNode>,
  variables: Record<string, unknown>,
) =>
  fieldNode.selectionSet && typeof fieldData === 'object' && fieldData !== null
    ? pickSelectionSet(fieldData, fieldNode.selectionSet, fragments, variables)
    : fieldData

/*
Conditional fragment matching could be done more correctly by passing a real
schema and passing runtime objects found using the input data's __typename.
This would mean fragments aren't matched correctly when the __typename is not
found, so should probably throw in that case.
*/
function pickSelectionSet(
  data: Record<string, unknown>,
  selectionSet: SelectionSetNode,
  fragments: Record<string, FragmentDefinitionNode>,
  variables: Record<string, unknown> = {},
): Record<string, unknown> {
  const fieldMap = collectFields(
    dummySchema,
    fragments,
    variables,
    // @ts-expect-error omit runtime type as we don't need conditional fragment matching
    undefined,
    selectionSet,
  )

  const pickedData: Record<string, unknown> = {}

  Array.from(fieldMap.values()).forEach((fieldNodes) => {
    fieldNodes.forEach((fieldNode) => {
      if (data.hasOwnProperty(fieldNode.name.value)) {
        const fieldData = data[fieldNode.name.value]

        pickedData[fieldNode.name.value] = Array.isArray(fieldData)
          ? fieldData.map((itemData: any) =>
              pickField(fieldNode, itemData, fragments, variables),
            )
          : pickField(fieldNode, fieldData, fragments, variables)
      }
    })
  })

  return pickedData
}

/*
- Assumes document has been validated beforehand and contains a valid operation.
- Without real schema conditional fragments cannot be evaluated; conditional
fragments are combined and all fields that exist on source data are picked.
*/
export default function pickOperationFields(
  data: Record<string, any>,
  documentNode: DocumentNode,
  operationName: string | null,
  variables?: Record<string, unknown>,
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

  return pickSelectionSet(data, operation.selectionSet, fragments, variables)
}
