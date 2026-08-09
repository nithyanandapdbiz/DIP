/**
 * TRACEABILITY: 03-intelligence-plane-architecture.md · ADR-0034 · ADR-0033
 *
 * Swagger/OpenAPI wiring (P1). Serves interactive docs at /api/docs and the spec at /api/docs-json.
 */
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Tenant Onboarding Experience API')
    .setDescription('Production REST API over the canonical tenant.json SSOT. Every route operates on the one manifest.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
