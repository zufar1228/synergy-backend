// backend/src/db/models/incident.ts
import { Model, DataTypes, UUIDV4, CreationOptional } from "sequelize";
import { sequelize } from "../config";

export interface IncidentAttributes {
  id: CreationOptional<string>;
  created_at: CreationOptional<Date>;
  device_id: string;
  incident_type: string;
  confidence: number | null;
  raw_features: object | null;
}

export type IncidentCreationAttributes = Omit<
  IncidentAttributes,
  "id" | "created_at"
>;

class Incident
  extends Model<IncidentAttributes, IncidentCreationAttributes>
  implements IncidentAttributes
{
  public id!: CreationOptional<string>;
  public created_at!: CreationOptional<Date>;
  public device_id!: string;
  public incident_type!: string;
  public confidence!: number | null;
  public raw_features!: object | null;
}

Incident.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    device_id: { type: DataTypes.UUID, allowNull: false },
    incident_type: { type: DataTypes.TEXT, allowNull: false },
    confidence: { type: DataTypes.REAL, allowNull: true },
    raw_features: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: "incidents",
    timestamps: false, // Kita sudah punya 'created_at'
    underscored: true,
  }
);

export default Incident;
