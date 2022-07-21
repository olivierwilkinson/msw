import { parse } from 'graphql'
import pickOperationFields from './pickOperationFields'

type Account = {
  __typename: 'Account'
  id: string
  name: string
  employer: Business | null
  pastEmployers: (Business | null)[]
}

type Business = {
  __typename: 'Business'
  id: string
  type: string
  productSKUs: string[]
  employees: Account[]
}

const business: Business = {
  __typename: 'Business',
  id: '0864297531',
  type: 'SME',
  productSKUs: ['sku1', 'sku2'],
  employees: [],
}

const otherBusiness: Business = {
  __typename: 'Business',
  id: '1357924680',
  type: 'Startup',
  productSKUs: ['otherSku1', 'otherSku2'],
  employees: [],
}

const jack: Account = {
  __typename: 'Account',
  id: '123456789',
  name: 'Jack',
  employer: business,
  pastEmployers: [null, otherBusiness],
}

const jill: Account = {
  __typename: 'Account',
  id: '0987654321',
  name: 'Jill',
  employer: null,
  pastEmployers: [],
}

business.employees = [jack, jill]

test('deep picks fields from queries', () => {
  expect(
    pickOperationFields(
      { user: jack, business, unknown: null },
      parse(`
        query($businessId: String!) {
          user {
            __typename
            id
            pastEmployers {
              id
              type
            }
          }
          business(id: $businessId) {
            type
            productSKUs
            employees {
              name
              employer {
                id
              }
            }
          }
        }
      `),
      null,
    ),
  ).toStrictEqual({
    user: {
      id: jack.id,
      __typename: jack.__typename,
      pastEmployers: jack.pastEmployers.map(
        (employer) =>
          employer && {
            id: employer.id,
            type: employer.type,
          },
      ),
    },
    business: {
      type: business.type,
      productSKUs: business.productSKUs,
      employees: business.employees.map((employee) => ({
        name: employee.name,
        employer: employee.employer && {
          id: employee.employer.id,
        },
      })),
    },
  })
})

test('deep picks fields from mutations', () => {
  expect(
    pickOperationFields(
      { addEmployee: business, leaveBusiness: jack, unknown: null },
      parse(`
        mutation($userId: String!, $newBusinessId: String!, $oldBusinessId: String!) {
          addEmployee(businessId: $newBusinessId, employeeId: $userId) {
            __typename
            id
            employees {
              __typename
              id
              name
              employer {
                __typename
                id
              }
            }
          }
          leaveBusiness(businessId: $oldBusinessId, employeeId: $userId) {
            id
            __typename
            pastEmployers {
              __typename
              id
              employees {
                id
              }
            }
          }
        }
      `),
      null,
    ),
  ).toStrictEqual({
    addEmployee: {
      __typename: business.__typename,
      id: business.id,
      employees: business.employees.map((employee) => ({
        __typename: employee.__typename,
        id: employee.id,
        name: employee.name,
        employer: employee.employer && {
          __typename: employee.employer.__typename,
          id: employee.employer.id,
        },
      })),
    },
    leaveBusiness: {
      __typename: jack.__typename,
      id: jack.id,
      pastEmployers: jack.pastEmployers.map(
        (employer) =>
          employer && {
            __typename: employer.__typename,
            id: employer.id,
            employees: [],
          },
      ),
    },
  })
})

test('deep picks fields from subscriptions', () => {
  expect(
    pickOperationFields(
      { onUserUpdate: jack, onBusinessUpdate: business, unknown: null },
      parse(`
        subscription($userId: String!, $businessId: String!) {
          onUserUpdate(id: $userId) {
            __typename
            id
            name
            employer {
              __typename
              id
            }
            pastEmployers {
              id
              type
            }
          }
          onBusinessUpdate(id: $businessId) {
            id
            __typename
            employees {
              __typename
              id
            }
          }
        }
      `),
      null,
    ),
  ).toStrictEqual({
    onUserUpdate: {
      __typename: jack.__typename,
      id: jack.id,
      name: jack.name,
      employer: {
        __typename: jack.employer?.__typename,
        id: jack.employer?.id,
      },
      pastEmployers: jack.pastEmployers.map(
        (employer) =>
          employer && {
            id: employer.id,
            type: employer.type,
          },
      ),
    },
    onBusinessUpdate: {
      __typename: business.__typename,
      id: business.id,
      employees: business.employees.map((employee) => ({
        __typename: employee.__typename,
        id: employee.id,
      })),
    },
  })
})

test('deep picks using anonymous operation when no operation name is passed', () => {
  expect(
    pickOperationFields(
      { user: jack, business, unknown: null },
      parse(`
        query {
          user {
            __typename
            id
          }
        }
        query GetUserName {
          user {
            name
          }
        }
      `),
      null,
    ),
  ).toStrictEqual({
    user: { id: jack.id, __typename: jack.__typename },
  })
})

test('deep picks using named operation when matching operation name passed', () => {
  expect(
    pickOperationFields(
      { user: jack, business, unknown: null },
      parse(`
        query GetUserAndBusiness {
          user {
            __typename
            id
          }
          business {
            type
            productSKUs
            employees {
              name
              employer {
                id
              }
            }
          }
        }
      `),
      'GetUserAndBusiness',
    ),
  ).toStrictEqual({
    user: { id: jack.id, __typename: jack.__typename },
    business: {
      type: business.type,
      productSKUs: business.productSKUs,
      employees: business.employees.map((employee) => ({
        name: employee.name,
        employer: employee.employer && {
          id: employee.employer.id,
        },
      })),
    },
  })
})

test('deep picks using operation that matches name when multiple named operations exist', () => {
  expect(
    pickOperationFields(
      { user: jack, business, unknown: null },
      parse(`
        query GetBusiness {
          business {
            id
          }
        }
        query GetUserName {
          user {
            name
          }
        }
        query GetEmployees {
          business {
            id
            employees {
              id
            }
          }
        }
      `),
      'GetUserName',
    ),
  ).toStrictEqual({
    user: { name: jack.name },
  })
})

test('picks fields from fragments', () => {
  const businessFields = {
    id: business.id,
    type: business.type,
    employees: [
      { id: jack.id, employer: { id: business.id } },
      { id: jill.id, employer: null },
    ],
  }

  const userFields = {
    name: jack.name,
    employer: businessFields,
  }

  expect(
    pickOperationFields(
      { user: jack, business, unknown: null },
      parse(`
        query($businessId: String!) {
          user {
            ...UserFields
          }
          business(id: $businessId) {
            ...BusinessFields
          }
        }

        fragment UserFields on Account {
          name
          employer {
            ...BusinessFields
          }
        }

        fragment BusinessFields on Business {
          id
          type
          employees {
            ... on Account {
              id
              employer {
                id
              }
            }
          }
        }
      `),
      null,
    ),
  ).toStrictEqual({
    user: userFields,
    business: businessFields,
  })
})

test('picks combined fields from conditional fragments', () => {
  const combined = { id: '1357902468', type: 'unknown', name: null }
  const user = {
    name: jack.name,
    relationships: [business, jill, combined],
  }

  expect(
    pickOperationFields(
      { user },
      parse(`
        query($businessId: String!) {
          user {
            relationships {
              ...UserFields
              ... on Business {
                id
                type
              }
            }
          }
        }

        fragment UserFields on Account {
          id
          name
        }
      `),
      null,
    ),
  ).toStrictEqual({
    user: {
      relationships: [
        { id: business.id, type: business.type },
        { id: jill.id, name: jill.name },
        combined,
      ],
    },
  })
})

test('skips fields with skip directive enabled', () => {
  const document = parse(`
    query($skipId: Boolean!, $skipName: Boolean!) {
      user {
        id @skip(if: $skipId)
        name @skip(if: $skipName)
      }
    }
  `)

  const pick = (variables: any) =>
    pickOperationFields({ user: jack }, document, null, variables)

  expect(pick({ skipId: false, skipName: false })).toStrictEqual({
    user: { id: jack.id, name: jack.name },
  })
  expect(pick({ skipId: false, skipName: true })).toStrictEqual({
    user: { id: jack.id },
  })
  expect(pick({ skipId: true, skipName: false })).toStrictEqual({
    user: { name: jack.name },
  })
  expect(pick({ skipId: true, skipName: true })).toStrictEqual({
    user: {},
  })
})

test('includes fields with include directive enabled', () => {
  const document = parse(`
    query($includeId: Boolean!, $includeName: Boolean!) {
      user {
        id @include(if: $includeId)
        name @include(if: $includeName)
      }
    }
  `)

  const pick = (variables: any) =>
    pickOperationFields({ user: jack }, document, null, variables)

  expect(pick({ includeId: true, includeName: true })).toStrictEqual({
    user: { id: jack.id, name: jack.name },
  })
  expect(pick({ includeId: true, includeName: false })).toStrictEqual({
    user: { id: jack.id },
  })
  expect(pick({ includeId: false, includeName: true })).toStrictEqual({
    user: { name: jack.name },
  })
  expect(pick({ includeId: false, includeName: false })).toStrictEqual({
    user: {},
  })
})

test('includes fields with include directive enabled and skip directive disabled', () => {
  const document = parse(`
    query($includeId: Boolean!, $skipId: Boolean!, $includeName: Boolean!, $skipName: Boolean!) {
      user {
        id @include(if: $includeId) @skip(if: $skipId)
        name @include(if: $includeName) @skip(if: $skipName)
      }
    }
  `)

  const pick = (variables: any) =>
    pickOperationFields({ user: jack }, document, null, variables)

  expect(
    pick({
      includeId: true,
      skipId: false,
      includeName: true,
      skipName: false,
    }),
  ).toStrictEqual({
    user: { id: jack.id, name: jack.name },
  })
  expect(
    pick({
      includeId: true,
      skipId: true,
      includeName: true,
      skipName: false,
    }),
  ).toStrictEqual({
    user: { name: jack.name },
  })
  expect(
    pick({
      includeId: true,
      skipId: true,
      includeName: true,
      skipName: true,
    }),
  ).toStrictEqual({
    user: {},
  })
  expect(
    pick({
      includeId: false,
      skipId: false,
      includeName: false,
      skipName: false,
    }),
  ).toStrictEqual({
    user: {},
  })
})

test('throws when passed an operation name that does not match any operation', () => {
  expect(() =>
    pickOperationFields(
      { user: jack, business },
      parse(`
        query {
          user {
            __typename
            id
          }
        }
        query GetUserName {
          user {
            name
          }
        }
      `),
      'UnknownOperation',
    ),
  ).toThrowError('Unable to find operation named "UnknownOperation"')
})
