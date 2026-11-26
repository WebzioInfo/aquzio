-- Idempotent PostgreSQL migration for AQUORA CompanyPublicProfiles and CompanyGalleryImages
CREATE TABLE IF NOT EXISTS public."CompanyPublicProfiles" (
    "Id" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "DisplayName" character varying(200) NULL,
    "ShortDescription" character varying(500) NULL,
    "About" text NULL,
    "EstablishedYear" integer NULL,
    "CoverImageUrl" character varying(1000) NULL,
    "CoverImagePublicId" character varying(500) NULL,
    "PublicEmail" character varying(200) NULL,
    "PublicPhone" character varying(50) NULL,
    "WebsiteUrl" character varying(500) NULL,
    "ContactPerson" character varying(200) NULL,
    "FullAddress" character varying(500) NULL,
    "City" character varying(120) NULL,
    "District" character varying(120) NULL,
    "State" character varying(120) NULL,
    "PinCode" character varying(20) NULL,
    "GoogleMapsUrl" character varying(1000) NULL,
    "Latitude" double precision NULL,
    "Longitude" double precision NULL,
    "FactoryIntroduction" text NULL,
    "ProductionFacilityDescription" text NULL,
    "ManufacturingInfrastructure" text NULL,
    "QualityControlFacilities" text NULL,
    "IsPublic" boolean NOT NULL DEFAULT true,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" text NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" text NULL,
    "CreatedByIP" text NULL,
    "UpdatedByIP" text NULL,
    CONSTRAINT "PK_CompanyPublicProfiles" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CompanyPublicProfiles_Tenants_TenantId" FOREIGN KEY ("TenantId") REFERENCES public."Tenants" ("Id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_CompanyPublicProfiles_TenantId"
    ON public."CompanyPublicProfiles" ("TenantId");

CREATE TABLE IF NOT EXISTS public."CompanyGalleryImages" (
    "Id" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "StorageKey" character varying(500) NOT NULL,
    "ImageUrl" character varying(1000) NOT NULL,
    "Category" character varying(64) NOT NULL,
    "Caption" character varying(300) NULL,
    "Format" character varying(20) NULL,
    "Bytes" bigint NOT NULL,
    "Width" integer NOT NULL,
    "Height" integer NOT NULL,
    "DisplayOrder" integer NOT NULL,
    "IsPublic" boolean NOT NULL DEFAULT true,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" text NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" text NULL,
    "CreatedByIP" text NULL,
    "UpdatedByIP" text NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" text NULL,
    CONSTRAINT "PK_CompanyGalleryImages" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CompanyGalleryImages_Tenants_TenantId" FOREIGN KEY ("TenantId") REFERENCES public."Tenants" ("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_CompanyGalleryImages_TenantId_IsDeleted_IsPublic_DisplayOrder"
    ON public."CompanyGalleryImages" ("TenantId", "IsDeleted", "IsPublic", "DisplayOrder");

