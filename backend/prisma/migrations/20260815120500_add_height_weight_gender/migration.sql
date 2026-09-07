-- CreateEnum
CREATE TYPE "HeightUnit" AS ENUM ('cm', 'inches', 'ft');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('kg', 'lbs');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "height_value" DOUBLE PRECISION,
ADD COLUMN "height_unit" "HeightUnit",
ADD COLUMN "weight_value" DOUBLE PRECISION,
ADD COLUMN "weight_unit" "WeightUnit",
ADD COLUMN "gender" "Gender";
