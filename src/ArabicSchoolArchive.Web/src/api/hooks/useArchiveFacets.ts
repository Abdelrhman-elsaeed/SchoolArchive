import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApi } from "../ApiClientContext";
import { ArchiveService, type ListArchivesQuery } from "../ArchiveService";
import type { ArchiveListResponse } from "../contracts";
import {
  buildFacets,
  fileTypeLabel,
  getMonthNameAr,
  type ArchiveFacets,
} from "../facets";

export type {
  ArchiveFacets,
  CategoryFacet,
  YearFacet,
  MonthFacet,
  FileTypeFacet,
  TagFacet,
} from "../facets";
export { fileTypeLabel, getMonthNameAr };

const FACET_PAGE_SIZE = 200;

export function useArchiveFacets(query: ListArchivesQuery) {
  const api = useApi();
  const service = useMemo(() => new ArchiveService(api), [api]);
  const facetQuery: ListArchivesQuery = {
    ...query,
    page: 1,
    pageSize: FACET_PAGE_SIZE,
  };
  return useQuery<ArchiveFacets>({
    queryKey: ["archives", "facets", facetQuery],
    queryFn: async (): Promise<ArchiveFacets> => {
      const resp: ArchiveListResponse = await service.list(facetQuery);
      return buildFacets(resp.items, resp.totalCount);
    },
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
}
