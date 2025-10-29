const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SKS API Server',
      version: '1.0.0',
      description: 'Node.js API server for tracking mobile number searches in the SKS meditation test results system',
    },
    tags: [
      {
        name: 'Tracking',
        description: 'Mobile number search tracking endpoints'
      },
      {
        name: 'Admin',
        description: 'Admin-only endpoints for viewing search data'
      },
      {
        name: 'Health',
        description: 'Server health monitoring endpoints'
      }
    ],
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        AdminSecret: {
          type: 'apiKey',
          in: 'query',
          name: 'secret',
          description: 'Admin secret key for protected routes'
        }
      },
      schemas: {
        MobileSearch: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Unique identifier'
            },
            mobile_number: {
              type: 'string',
              pattern: '^\\d{10}$',
              description: '10-digit mobile number'
            },
            click_count: {
              type: 'integer',
              description: 'Number of times this mobile number was searched'
            },
            last_updated: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp'
            }
          }
        },
        TrackSearchRequest: {
          type: 'object',
          required: ['mobileNumber'],
          properties: {
            mobileNumber: {
              type: 'string',
              pattern: '^\\d{10}$',
              description: '10-digit mobile number to track'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              $ref: '#/components/schemas/MobileSearch'
            }
          }
        },
        AdminResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/MobileSearch'
              }
            },
            total: {
              type: 'integer',
              description: 'Total number of records'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'OK'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      }
    }
  },
  apis: ['./server.js'],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };