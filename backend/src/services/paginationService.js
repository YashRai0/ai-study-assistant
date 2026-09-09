// Pagination helper
export function getPaginationParams(req) {
  let limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
  let skip = Math.max(parseInt(req.query.skip) || 0, 0);
  let page = Math.max(parseInt(req.query.page) || 1, 1);

  // If page is provided, calculate skip from page
  if (req.query.page) {
    skip = (page - 1) * limit;
  }

  return { limit, skip, page };
}

export function buildPaginationResponse(data, total, limit, skip) {
  const page = Math.floor(skip / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    data,
    pagination: {
      total,
      limit,
      skip,
      page,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
  };
}
