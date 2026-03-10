module.exports = {
    preset: '@shelf/jest-mongodb',
    testEnvironment: 'node',

    setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'], // ← Make sure this says .cjs

    extensionsToTreatAsEsm: ['.ts'],

    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            useESM: true,
            tsconfig: {
                module: 'esnext',
            }
        }],
    },

    testMatch: ['**/__tests__/**/*.test.ts'],

    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },

    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
    ],

    coverageThreshold: {
        global: {
            branches: 75,
            functions: 93,
            lines: 85,
            statements: 85
        }
    },
};
