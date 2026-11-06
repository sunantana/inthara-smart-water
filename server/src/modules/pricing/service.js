import { AppError } from '../../utils/errors.js';
import * as repo from './repo.js';

export function mapPriceTierDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    price189lSat: row.price_189l_sat,
    price350mlSat: row.price_350ml_sat,
    price600mlSat: row.price_600ml_sat,
    price1500mlSat: row.price_1500ml_sat,
    prices: {
      'FG-189L': row.price_189l_sat,
      'FG-350ML': row.price_350ml_sat,
      'FG-600ML': row.price_600ml_sat,
      'FG-1500ML': row.price_1500ml_sat,
    },
    isActive: Boolean(row.is_active),
    customerCount: Number(row.customer_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPriceTiers(query = {}) {
  let isActive;
  if (query.active !== undefined && query.active !== 'all') {
    isActive = query.active === '1' || query.active === 'true';
  }
  const rows = repo.listPriceTiers({ isActive });
  return {
    data: rows.map(mapPriceTierDto),
  };
}

export function createPriceTier(payload) {
  const cleanName = payload.name.trim();
  const existing = repo.findPriceTierByName(cleanName);
  if (existing) {
    throw AppError.conflict('ชื่อระดับราคา (Price Tier) นี้มีอยู่ในระบบแล้ว');
  }

  const price189lSat = payload.price189lSat ?? payload.prices?.['FG-189L'] ?? 0;
  const price350mlSat = payload.price350mlSat ?? payload.prices?.['FG-350ML'] ?? 0;
  const price600mlSat = payload.price600mlSat ?? payload.prices?.['FG-600ML'] ?? 0;
  const price1500mlSat = payload.price1500mlSat ?? payload.prices?.['FG-1500ML'] ?? 0;

  const created = repo.insertPriceTier({
    name: cleanName,
    price189lSat,
    price350mlSat,
    price600mlSat,
    price1500mlSat,
    isActive: payload.isActive ?? true,
  });

  return mapPriceTierDto(created);
}

export function updatePriceTier(id, payload) {
  const tierId = Number(id);
  const existing = repo.findPriceTierById(tierId);
  if (!existing) {
    throw AppError.notFound('ไม่พบระดับราคาที่ต้องการแก้ไข');
  }

  if (payload.name !== undefined) {
    const cleanName = payload.name.trim();
    const byName = repo.findPriceTierByName(cleanName);
    if (byName && byName.id !== tierId) {
      throw AppError.conflict('ชื่อระดับราคานี้ถูกใช้งานแล้ว');
    }
  }

  const fields = {};
  if (payload.name !== undefined) fields.name = payload.name.trim();
  if (payload.price189lSat !== undefined || payload.prices?.['FG-189L'] !== undefined) {
    fields.price189lSat = payload.price189lSat ?? payload.prices['FG-189L'];
  }
  if (payload.price350mlSat !== undefined || payload.prices?.['FG-350ML'] !== undefined) {
    fields.price350mlSat = payload.price350mlSat ?? payload.prices['FG-350ML'];
  }
  if (payload.price600mlSat !== undefined || payload.prices?.['FG-600ML'] !== undefined) {
    fields.price600mlSat = payload.price600mlSat ?? payload.prices['FG-600ML'];
  }
  if (payload.price1500mlSat !== undefined || payload.prices?.['FG-1500ML'] !== undefined) {
    fields.price1500mlSat = payload.price1500mlSat ?? payload.prices['FG-1500ML'];
  }
  if (payload.isActive !== undefined) {
    fields.isActive = payload.isActive;
  }

  const updated = repo.updatePriceTierById(tierId, fields);
  return mapPriceTierDto(updated);
}

export function deletePriceTier(id) {
  const tierId = Number(id);
  const existing = repo.findPriceTierById(tierId);
  if (!existing) {
    throw AppError.notFound('ไม่พบระดับราคาที่ต้องการลบ');
  }

  const customerCount = repo.countCustomersUsingTier(tierId);
  if (customerCount > 0) {
    throw AppError.conflict(
      `ไม่สามารถลบระดับราคา "${existing.name}" ได้ เนื่องจากมีลูกค้าผูกอยู่ ${customerCount} ราย`,
    );
  }

  repo.deletePriceTierById(tierId);
  return { id: tierId, deleted: true };
}

export default {
  listPriceTiers,
  createPriceTier,
  updatePriceTier,
  deletePriceTier,
  mapPriceTierDto,
};
