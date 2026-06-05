openapi: 3.1.0

info:
title: Chuenjai AI Care Platform API
version: 1.0.0
description: Multi-Tenant AI Elderly Care Platform

servers:

url: https://api.chuenjai.com/api/v1
description: Production

tags:

name: Authentication
name: Organizations
name: Users
name: Elderlies
name: Diseases
name: Medications
name: Appointments
name: Dashboard

components:

securitySchemes:

bearerAuth:
  type: http
  scheme: bearer
  bearerFormat: JWT

schemas:

ApiResponse:
  type: object
  properties:
    success:
      type: boolean

ErrorResponse:
  type: object
  properties:
    success:
      type: boolean
    code:
      type: string
    message:
      type: string

LoginRequest:
  type: object
  required:
    - username
    - password
  properties:
    username:
      type: string
    password:
      type: string

LoginResponse:
  type: object
  properties:
    accessToken:
      type: string
    refreshToken:
      type: string

Organization:
  type: object
  properties:
    id:
      type: integer
    organizationName:
      type: string
    organizationType:
      type: string
    province:
      type: string

User:
  type: object
  properties:
    id:
      type: integer
    username:
      type: string
    fullName:
      type: string
    role:
      type: string

Elderly:
  type: object
  properties:
    id:
      type: integer
    citizenId:
      type: string
    firstName:
      type: string
    lastName:
      type: string
    phone:
      type: string

Disease:
  type: object
  properties:
    id:
      type: integer
    diseaseName:
      type: string

Medication:
  type: object
  properties:
    id:
      type: integer
    medicationName:
      type: string
    dosage:
      type: string
    scheduleTime:
      type: string

Appointment:
  type: object
  properties:
    id:
      type: integer
    hospitalName:
      type: string
    appointmentDatetime:
      type: string
      format: date-time

security:

bearerAuth: []

paths:

/auth/login:

post:
  tags:
    - Authentication

  summary: Login

  requestBody:
    required: true

    content:
      application/json:

        schema:
          $ref: '#/components/schemas/LoginRequest'

  responses:

    '200':
      description: Success

      content:
        application/json:

          schema:
            $ref: '#/components/schemas/LoginResponse'

/auth/refresh:

post:
  tags:
    - Authentication

  summary: Refresh Token

  responses:

    '200':
      description: Success

/organizations:

get:
  tags:
    - Organizations

  summary: List Organizations

  responses:

    '200':
      description: Success

post:
  tags:
    - Organizations

  summary: Create Organization

  responses:

    '201':
      description: Created

/organizations/{id}:

get:
  tags:
    - Organizations

  summary: Get Organization

  parameters:

    - name: id
      in: path
      required: true
      schema:
        type: integer

  responses:

    '200':
      description: Success

put:
  tags:
    - Organizations

  summary: Update Organization

  responses:

    '200':
      description: Updated

delete:
  tags:
    - Organizations

  summary: Delete Organization

  responses:

    '204':
      description: Deleted

/users:

get:
  tags:
    - Users

  summary: List Users

  responses:

    '200':
      description: Success

post:
  tags:
    - Users

  summary: Create User

  responses:

    '201':
      description: Created

/users/{id}:

get:
  tags:
    - Users

  summary: Get User

  parameters:

    - name: id
      in: path
      required: true
      schema:
        type: integer

  responses:

    '200':
      description: Success

put:
  tags:
    - Users

  summary: Update User

  responses:

    '200':
      description: Updated

delete:
  tags:
    - Users

  summary: Disable User

  responses:

    '204':
      description: Deleted

/elderlies:

get:
  tags:
    - Elderlies

  summary: Search Elderlies

  parameters:

    - name: keyword
      in: query
      schema:
        type: string

    - name: page
      in: query
      schema:
        type: integer

    - name: limit
      in: query
      schema:
        type: integer

  responses:

    '200':
      description: Success

post:
  tags:
    - Elderlies

  summary: Create Elderly

  responses:

    '201':
      description: Created

/elderlies/{id}:

get:
  tags:
    - Elderlies

  summary: Get Elderly Profile

  parameters:

    - name: id
      in: path
      required: true
      schema:
        type: integer

  responses:

    '200':
      description: Success

put:
  tags:
    - Elderlies

  summary: Update Elderly

  responses:

    '200':
      description: Updated

delete:
  tags:
    - Elderlies

  summary: Delete Elderly

  responses:

    '204':
      description: Deleted

/elderlies/import:

post:
  tags:
    - Elderlies

  summary: Import Excel

  requestBody:
    content:
      multipart/form-data:
        schema:
          type: object
          properties:
            file:
              type: string
              format: binary

  responses:

    '200':
      description: Imported

/diseases:

get:
  tags:
    - Diseases

  summary: List Diseases

post:
  tags:
    - Diseases

  summary: Create Disease

/diseases/{id}:

put:
  tags:
    - Diseases

  summary: Update Disease

delete:
  tags:
    - Diseases

  summary: Delete Disease

/medications:

get:
  tags:
    - Medications

  summary: List Medications

post:
  tags:
    - Medications

  summary: Create Medication

/medications/{id}:

put:
  tags:
    - Medications

  summary: Update Medication

delete:
  tags:
    - Medications

  summary: Delete Medication

/appointments:

get:
  tags:
    - Appointments

  summary: List Appointments

post:
  tags:
    - Appointments

  summary: Create Appointment

/appointments/{id}:

put:
  tags:
    - Appointments

  summary: Update Appointment

delete:
  tags:
    - Appointments

  summary: Cancel Appointment

/dashboard/executive:

get:
  tags:
    - Dashboard

  summary: Executive Dashboard

  responses:

    '200':
      description: Success

/dashboard/risk:

get:
  tags:
    - Dashboard

  summary: Risk Dashboard

  responses:

    '200':
      description: Success