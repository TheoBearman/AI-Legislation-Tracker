import { getCollection } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import type { Legislation } from '@/types/legislation';
import type { LegislationMongoDbDocument } from '@/types/legislation';

function cleanupDataForMongoDB<T extends Record<string, any>>(data: T): T {
  const cleanData = { ...data };
  const arrayFields = ['subjects', 'classification', 'sources', 'versions', 'abstracts', 'sponsors', 'history'];
  for (const field of arrayFields) {
    if (cleanData[field] !== undefined && !Array.isArray(cleanData[field])) {
      (cleanData as Record<string, any>)[field] = Array.isArray(cleanData[field] ? cleanData[field] : (cleanData[field] ? [cleanData[field]] : []));
    } else if (cleanData[field] === undefined) {
      (cleanData as Record<string, any>)[field] = [];
    }
  }
  return cleanData;
}

export async function addLegislation(legislationData: Legislation): Promise<void> {
  if (!legislationData.id) {
    console.error('Legislation ID is required to add legislation.');
    throw new Error('Legislation ID is required to add legislation.');
  }
  try {
    const { id, ...dataToAdd } = legislationData;
    let cleanedData = cleanupDataForMongoDB(dataToAdd);
    cleanedData.createdAt = new Date();
    cleanedData.updatedAt = new Date();
    if (cleanedData.firstActionAt) {
      cleanedData.firstActionAt = new Date(cleanedData.firstActionAt);
    }
    if (cleanedData.latestActionAt) {
      cleanedData.latestActionAt = new Date(cleanedData.latestActionAt);
    }
    if (cleanedData.latestPassageAt) {
      cleanedData.latestPassageAt = new Date(cleanedData.latestPassageAt);
    }
    const legislationCollection = await getCollection('legislation');
    console.log(`Adding legislation ${legislationData.id} (${legislationData.identifier || 'no identifier'})`);
    await legislationCollection.insertOne({
      _id: new ObjectId(),
      id,
      ...cleanedData
    });
  } catch (error) {
    console.error(`Error adding legislation document with id ${legislationData.id}: `, error);
    throw new Error('Failed to add legislation.');
  }
}

export async function upsertLegislation(legislationData: Legislation): Promise<void> {
  if (!legislationData.id) {
    console.error('Legislation ID is required to upsert legislation.');
    throw new Error('Legislation ID is required to upsert legislation.');
  }
  try {
    const { id, ...dataToUpsert } = legislationData;
    let cleanedData = cleanupDataForMongoDB(dataToUpsert);
    const { createdAt, ...dataForSet } = cleanedData;
    dataForSet.updatedAt = new Date();
    if (dataForSet.firstActionAt) {
      dataForSet.firstActionAt = new Date(dataForSet.firstActionAt);
    }
    if (dataForSet.latestActionAt) {
      dataForSet.latestActionAt = new Date(dataForSet.latestActionAt);
    }
    if (dataForSet.latestPassageAt) {
      dataForSet.latestPassageAt = new Date(dataForSet.latestPassageAt);
    }
    const legislationCollection = await getCollection('legislation');
    console.log(`Upserting legislation ${legislationData.id} (${legislationData.identifier || 'no identifier'})`);
    await legislationCollection.updateOne(
      { id },
      {
        $set: dataForSet,
        $setOnInsert: { createdAt: createdAt || new Date(), id }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error(`Error upserting legislation document with id ${legislationData.id}: `, error);
    throw new Error('Failed to upsert legislation.');
  }
}

export async function upsertLegislationSelective(legislationData: Legislation): Promise<void> {
  if (!legislationData.id) {
    console.error('Legislation ID is required to upsert legislation.');
    throw new Error('Legislation ID is required to upsert legislation.');
  }
  try {
    const { id, ...dataToUpsert } = legislationData;
    let cleanedData = cleanupDataForMongoDB(dataToUpsert);
    const { createdAt, ...dataForSet } = cleanedData;
    dataForSet.updatedAt = new Date();
    if (dataForSet.firstActionAt) {
      dataForSet.firstActionAt = new Date(dataForSet.firstActionAt);
    }
    if (dataForSet.latestActionAt) {
      dataForSet.latestActionAt = new Date(dataForSet.latestActionAt);
    }
    if (dataForSet.latestPassageAt) {
      dataForSet.latestPassageAt = new Date(dataForSet.latestPassageAt);
    }
    const legislationCollection = await getCollection('legislation');
    // Fetch the existing document
    const existing = await legislationCollection.findOne({ id });
    if (!existing) {
      // Insert as new if not found
      await legislationCollection.insertOne({
        _id: new ObjectId(),
        id,
        ...dataForSet,
        createdAt: createdAt || new Date(),
      });
      console.log(`Inserted new legislation ${id}`);
      return;
    }
    // Only update fields that have changed, but ignore updatedAt and createdAt in comparison
    const ignoreFields = ['updatedAt', 'createdAt'];
    const updateFields: Record<string, any> = {};
    for (const key of Object.keys(dataForSet)) {
      if (ignoreFields.includes(key)) continue;
      const newValue = (dataForSet as any)[key];
      const oldValue = (existing as any)[key];
      // Compare arrays and objects by JSON.stringify, primitives by ===
      if (Array.isArray(newValue) || typeof newValue === 'object') {
        if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
          updateFields[key] = newValue;
        }
      } else {
        if (newValue !== oldValue) {
          updateFields[key] = newValue;
        }
      }
    }
    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await legislationCollection.updateOne(
        { id },
        { $set: updateFields }
      );
      console.log(`Updated fields for legislation ${id}:`, Object.keys(updateFields));
    } else {
      // No changes
      console.log(`No changes for legislation ${id}`);
    }
  } catch (error) {
    console.error(`Error selectively upserting legislation document with id ${legislationData.id}: `, error);
    throw new Error('Failed to upsert legislation selectively.');
  }
}

function convertDocumentToLegislation(doc: LegislationMongoDbDocument): Legislation {
  const { _id, ...rest } = doc;
  return rest as Legislation;
}

export async function getLegislationByMongoId(mongoId: string): Promise<Legislation | null> {
  if (!mongoId) {
    console.error('MongoDB ID is required to fetch legislation.');
    return null;
  }
  try {
    if (!ObjectId.isValid(mongoId)) {
      console.error('Invalid MongoDB ID format.');
      return null;
    }
    const legislationCollection = await getCollection('legislation');
    const document = await legislationCollection.findOne({ _id: new ObjectId(mongoId) }) as LegislationMongoDbDocument | null;
    if (document) {
      return convertDocumentToLegislation(document);
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error fetching legislation document with MongoDB ID ${mongoId}: `, error);
    return null;
  }
}

export async function getLegislationById(id: string): Promise<Legislation | null> {
  if (!id) {
    console.error('ID is required to fetch legislation.');
    return null;
  }
  try {
    const legislationCollection = await getCollection('legislation');
    const document = await legislationCollection.findOne({ id });
    if (document) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id, ...restOfDoc } = document;
      return restOfDoc as Legislation;
    }

    // If not found in legislation, try executive_orders
    const eoCollection = await getCollection('executive_orders');
    const eoDoc = await eoCollection.findOne({ id });

    if (eoDoc) {
      // Map ExecutiveOrder to Legislation
      return {
        id: eoDoc.id,
        title: eoDoc.title,
        identifier: eoDoc.number ? (eoDoc.state === 'United States' ? `EO ${eoDoc.number}` : `Exec. Order ${eoDoc.number}`) : 'Executive Order',
        jurisdictionName: eoDoc.state,
        classification: ['executive-order'],
        session: new Date(eoDoc.date_signed).getFullYear().toString(),
        statusText: 'Signed',
        summary: eoDoc.geminiSummary || eoDoc.summary,
        // Map full_text to fullText for the frontend
        fullText: eoDoc.full_text,
        createdAt: eoDoc.createdAt,
        updatedAt: eoDoc.updatedAt || eoDoc.createdAt,
        firstActionAt: eoDoc.date_signed,
        latestActionAt: eoDoc.date_signed,
        latestPassageAt: eoDoc.date_signed,
        enactedAt: eoDoc.date_signed,
        latestActionDescription: `Signed by ${eoDoc.governor_or_president}`,
        sponsors: [{ name: eoDoc.governor_or_president, role: 'Executive' }],
        subjects: eoDoc.topics || [],
        sources: [{ url: eoDoc.full_text_url, note: 'Official Source' }],
        stateLegislatureUrl: eoDoc.full_text_url
      } as Legislation;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching legislation document with id ${id}: `, error);
    return null;
  }
}

export async function getLegislationsByIds(ids: string[]): Promise<Legislation[]> {
  if (!ids || ids.length === 0) {
    console.error('IDs array is required to fetch multiple legislation documents.');
    return [];
  }
  try {
    const legislationCollection = await getCollection('legislation');
    const documents = await legislationCollection.find({
      id: { $in: ids }
    }).toArray();

    return documents.map(doc => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id, ...restOfDoc } = doc;
      return restOfDoc as Legislation;
    });
  } catch (error) {
    console.error(`Error fetching legislation documents with ids ${ids.join(', ')}: `, error);
    return [];
  }
}

export async function getAllLegislationWithFiltering({
  search,
  limit = 100,
  skip = 0,
  sortBy,
  sortDir = 'desc',
  showCongress = false,
  sponsorId,
  showOnlyEnacted,
  session,
  identifier,
  jurisdiction,
  jurisdictionName,
  subject,
  chamber,
  classification,
  statusText,
  sponsor,
  firstActionAt_gte,
  firstActionAt_lte,
  updatedAt_gte,
  updatedAt_lte,
  latestActionAt_gte,
  latestActionAt_lte,
  state,
  stateAbbr,
  context
}: {
  search?: string;
  limit?: number;
  skip?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  showCongress?: boolean;
  sponsorId?: string;
  showOnlyEnacted?: string;
  session?: string;
  identifier?: string;
  jurisdiction?: string;
  jurisdictionName?: string;
  subject?: string;
  chamber?: string;
  classification?: string;
  statusText?: string;
  sponsor?: string;
  firstActionAt_gte?: string;
  firstActionAt_lte?: string;
  updatedAt_gte?: string;
  updatedAt_lte?: string;
  latestActionAt_gte?: string;
  latestActionAt_lte?: string;
  state?: string;
  stateAbbr?: string;
  context?: 'policy-updates-feed' | 'policy-tracker' | 'email-script' | 'api';
}): Promise<Legislation[]> {
  try {
    // Parse filtering parameters
    const otherFilters: Record<string, any> = {};

    // Always filter by sponsorId if present
    if (sponsorId) {
      // Normalize id to use slashes (ocd-person/uuid) for matching sponsors.id
      const normalizedId = sponsorId.replace(/^ocd-person_/, 'ocd-person/').replace(/_/g, '-').replace('ocd-person/-', 'ocd-person/');
      otherFilters['$or'] = [
        { 'sponsors.id': sponsorId },
        { 'sponsors.id': normalizedId }
      ];
    }

    // Add enacted filter if showOnlyEnacted param is present
    if (showOnlyEnacted === 'true') {
      otherFilters.enactedAt = { $ne: null };
    }

    // Parse sorting parameters with context-aware logic
    let sort: Record<string, 1 | -1>;

    if (showOnlyEnacted === 'true' || showOnlyEnacted === 'false') {
      // For enacted filtering, always sort by enactedAt first, then latestActionAt
      if (sortDir === 'asc') {
        sort = { enactedAt: 1, latestActionAt: 1 };
      } else {
        sort = { enactedAt: -1, latestActionAt: -1 };
      }
    } else if (context === 'policy-tracker' || context === 'email-script') {
      // PolicyTracker and email scripts always sort by updatedAt for most recently updated legislation
      if (sortDir === 'asc') {
        sort = { updatedAt: 1, latestActionAt: 1 };
      } else {
        sort = { updatedAt: -1, latestActionAt: -1 };
      }
    } else if (context === 'policy-updates-feed') {
      // PolicyUpdatesFeed respects user-selected sorting but defaults to createdAt for "Most Recent"
      if (sortBy === 'lastActionAt' || sortBy === 'latestActionAt') {
        // User explicitly selected "Latest Action" - sort by legislative activity
        if (sortDir === 'asc') {
          sort = { latestActionAt: 1, updatedAt: 1 };
        } else {
          sort = { latestActionAt: -1, updatedAt: -1 };
        }
      } else if (sortBy === 'createdAt' || !sortBy) {
        // User selected "Most Recent" or default - sort by creation date
        if (sortDir === 'asc') {
          sort = { createdAt: 1, updatedAt: 1 };
        } else {
          sort = { createdAt: -1, updatedAt: -1 };
        }
      } else {
        // Other sorting options (title, etc.)
        const sortField = sortBy || 'createdAt';
        sort = { [sortField]: sortDir === 'asc' ? 1 : -1 };
      }
    } else {
      // Default behavior for API and other contexts - use latestActionAt for better UX
      if (sortDir === 'asc') {
        sort = { latestActionAt: 1, updatedAt: 1 };
      } else {
        sort = { latestActionAt: -1, updatedAt: -1 };
      }
    }

    // Common filters
    if (session) {
      otherFilters.session = session;
    }
    if (identifier) {
      otherFilters.identifier = identifier;
    }
    if (jurisdiction) {
      otherFilters.jurisdictionId = jurisdiction;
    }

    // Handle Congress vs State filtering
    const isCongress: boolean = !!(
      showCongress ||
      (state && state.toLowerCase() === 'united states congress') ||
      (stateAbbr && stateAbbr.toUpperCase() === 'US')
    );
    if (isCongress) {
      console.log('[Service] Filtering for ALL Congress sessions');
      otherFilters.jurisdictionName = 'United States Congress';
    } else if (jurisdictionName) {
      otherFilters.jurisdictionName = jurisdictionName;
    }

    if (subject) {
      otherFilters.subjects = subject;
    }
    if (chamber) {
      otherFilters.chamber = chamber;
    }
    if (classification) {
      otherFilters.classification = classification;
    }
    if (statusText) {
      otherFilters.statusText = statusText;
    }
    if (sponsor) {
      if (showCongress) {
        // Congress sponsor handling
      } else if (sponsorId) {
        const normalizedId = sponsorId.replace(/^ocd-person_/, 'ocd-person/').replace(/_/g, '-').replace('ocd-person/-', 'ocd-person/');
        otherFilters['$or'] = [
          { 'sponsors.id': sponsorId },
          { 'sponsors.id': normalizedId }
        ];
      } else {
        otherFilters['sponsors.name'] = sponsor;
      }
    }

    // Date range filters (e.g., firstActionAt_gte, firstActionAt_lte)
    if (firstActionAt_gte || firstActionAt_lte) {
      otherFilters.firstActionAt = {};
      if (firstActionAt_gte) otherFilters.firstActionAt.$gte = new Date(firstActionAt_gte);
      if (firstActionAt_lte) otherFilters.firstActionAt.$lte = new Date(firstActionAt_lte);
    }

    // updatedAt date range filters
    if (updatedAt_gte || updatedAt_lte) {
      otherFilters.updatedAt = {};
      if (updatedAt_gte) otherFilters.updatedAt.$gte = new Date(updatedAt_gte);
      if (updatedAt_lte) otherFilters.updatedAt.$lte = new Date(updatedAt_lte);
    }

    // latestActionAt date range filters
    if (latestActionAt_gte || latestActionAt_lte) {
      otherFilters.latestActionAt = {};
      if (latestActionAt_gte) otherFilters.latestActionAt.$gte = new Date(latestActionAt_gte);
      if (latestActionAt_lte) otherFilters.latestActionAt.$lte = new Date(latestActionAt_lte);
    }

    // Full text search
    let finalFilter = { ...otherFilters };
    if (search) {
      const searchOr = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
        { identifier: { $regex: search, $options: 'i' } },
        { classification: search },
        { classification: { $regex: search, $options: 'i' } },
        { subjects: search },
        { subjects: { $regex: search, $options: 'i' } }
      ];
      // If there are other filters, combine with $and
      const filtersWithoutOr = { ...otherFilters };
      delete filtersWithoutOr.$or;
      finalFilter = { $and: [filtersWithoutOr, { $or: searchOr }] };
    }

    // Get legislation using the improved search approach
    let legislations = await getAllLegislation({
      limit: limit + 50, // Get more results to allow for proper sorting
      skip,
      sort,
      filter: finalFilter,
      showCongress: isCongress
    });

    // Apply context-aware consistent sorting
    legislations.sort((a, b) => {
      // Helper function to get the appropriate date based on context and sort field
      const getComparisonDate = (bill: any) => {
        if (context === 'policy-updates-feed') {
          // For PolicyUpdatesFeed, respect the user's sorting choice
          if (sortBy === 'lastActionAt' || sortBy === 'latestActionAt') {
            // User chose "Latest Action"
            if (bill.latestActionAt) return new Date(bill.latestActionAt).getTime();
            if (bill.history && bill.history.length > 0) {
              const historyDates = bill.history
                .map((h: any) => h.date ? new Date(h.date).getTime() : 0)
                .filter((date: number) => date > 0);
              if (historyDates.length > 0) return Math.max(...historyDates);
            }
            if (bill.updatedAt) return new Date(bill.updatedAt).getTime();
            if (bill.createdAt) return new Date(bill.createdAt).getTime();
          } else if (sortBy === 'createdAt' || !sortBy) {
            // User chose "Most Recent" (creation date)
            if (bill.createdAt) return new Date(bill.createdAt).getTime();
            if (bill.updatedAt) return new Date(bill.updatedAt).getTime();
          }
        } else {
          // For PolicyTracker, email script, and other contexts - always use latest legislative activity
          if (bill.latestActionAt) return new Date(bill.latestActionAt).getTime();
          if (bill.history && bill.history.length > 0) {
            const historyDates = bill.history
              .map((h: any) => h.date ? new Date(h.date).getTime() : 0)
              .filter((date: number) => date > 0);
            if (historyDates.length > 0) return Math.max(...historyDates);
          }
          if (bill.updatedAt) return new Date(bill.updatedAt).getTime();
          if (bill.createdAt) return new Date(bill.createdAt).getTime();
        }
        return 0;
      };

      const dateA = getComparisonDate(a);
      const dateB = getComparisonDate(b);

      return sortDir === 'asc' ? dateA - dateB : dateB - dateA;
    });

    // Trim back to requested limit
    legislations = legislations.slice(0, limit);

    // Fuzzy search fallback: only if no results and a search term is present
    if (search && legislations.length === 0) {
      // Strictly apply all non-search filters (deep copy, excluding $or)
      const fuzzyFilter: Record<string, any> = JSON.parse(JSON.stringify(otherFilters));
      if (fuzzyFilter.$or) delete fuzzyFilter.$or;
      // Congress, session, chamber, etc. are already present if set
      const allCandidates = await getAllLegislation({
        limit: 100,
        skip: 0,
        sort,
        filter: fuzzyFilter,
        showCongress: isCongress
      });
      if (allCandidates.length > 0) {
        const Fuse = (await import('fuse.js')).default;
        // Only use the same fields as regular full text search
        const fuseKeys = [
          "title",
          "summary",
          "identifier",
          "classification",
          "subjects"
        ];
        const normalizedCandidates = allCandidates.map((u: any, idx: number) => ({
          idx,
          title: u.title ? String(u.title).toLowerCase().trim() : '',
          summary: u.summary ? String(u.summary).toLowerCase().trim() : '',
          identifier: u.identifier ? String(u.identifier).toLowerCase().trim() : '',
          classification: Array.isArray(u.classification) ? u.classification.map((v: any) => String(v).toLowerCase().trim()) : [],
          subjects: Array.isArray(u.subjects) ? u.subjects.map((v: any) => String(v).toLowerCase().trim()) : [],
        }));
        const fuse = new Fuse(normalizedCandidates, {
          keys: fuseKeys,
          threshold: 0.4,
          ignoreLocation: true,
          includeScore: true,
          findAllMatches: true,
          minMatchCharLength: 2,
        });
        const fuzzyResults = fuse.search(search.trim().toLowerCase()).map(r => r.item.idx);
        let fuzzyLegislations = fuzzyResults.map(idx => allCandidates[idx]);

        // Sort fuzzy results consistently with context-aware logic
        fuzzyLegislations.sort((a, b) => {
          const getLatestDate = (bill: any) => {
            if (context === 'policy-updates-feed') {
              // For PolicyUpdatesFeed, respect the user's sorting choice
              if (sortBy === 'lastActionAt' || sortBy === 'latestActionAt') {
                // User chose "Latest Action"
                if (bill.latestActionAt) return new Date(bill.latestActionAt).getTime();
                if (bill.history && bill.history.length > 0) {
                  const historyDates = bill.history
                    .map((h: any) => h.date ? new Date(h.date).getTime() : 0)
                    .filter((date: number) => date > 0);
                  if (historyDates.length > 0) return Math.max(...historyDates);
                }
                if (bill.updatedAt) return new Date(bill.updatedAt).getTime();
                if (bill.createdAt) return new Date(bill.createdAt).getTime();
              } else if (sortBy === 'createdAt' || !sortBy) {
                // User chose "Most Recent" (creation date)
                if (bill.createdAt) return new Date(bill.createdAt).getTime();
                if (bill.updatedAt) return new Date(bill.updatedAt).getTime();
              }
            } else {
              // For PolicyTracker, email script, and other contexts - always use latest legislative activity
              if (bill.latestActionAt) return new Date(bill.latestActionAt).getTime();
              if (bill.history && bill.history.length > 0) {
                const historyDates = bill.history
                  .map((h: any) => h.date ? new Date(h.date).getTime() : 0)
                  .filter((date: number) => date > 0);
                if (historyDates.length > 0) return Math.max(...historyDates);
              }
              if (bill.updatedAt) return new Date(bill.updatedAt).getTime();
              if (bill.createdAt) return new Date(bill.createdAt).getTime();
            }
            return 0;
          };

          const dateA = getLatestDate(a);
          const dateB = getLatestDate(b);
          return sortDir === 'asc' ? dateA - dateB : dateB - dateA;
        });

        legislations = fuzzyLegislations.slice(0, limit);
      }
    }

    return legislations;
  } catch (error) {
    console.error('Error in getAllLegislationWithFiltering:', error);
    throw new Error('Failed to fetch legislation with filtering.');
  }
}

export async function getAllLegislation({
  limit = 100,
  skip = 0,
  sort = { updatedAt: -1 },
  filter = {},
  showCongress = false
}: {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  filter?: Record<string, any>;
  showCongress?: boolean;
}): Promise<Legislation[]> {
  try {
    const legislationCollection = await getCollection('legislation');

    // If showCongress is true, use robust query to match all Congress bills
    if (showCongress) {
      console.log('[Service] Using robust query for Congress bills');
      const congressQuery = {
        $or: [
          {
            jurisdictionName: {
              $regex: "United States|US|USA|Federal|Congress",
              $options: "i"
            }
          },
          {
            $and: [
              {
                $or: [
                  { jurisdictionName: { $exists: false } },
                  { jurisdictionName: null },
                  { jurisdictionName: "" }
                ]
              },
              { session: { $regex: "Congress", $options: "i" } }
            ]
          }
        ]
      };
      // Merge with any additional filters (e.g., search, classification, chamber)
      const mergedFilter = filter && Object.keys(filter).length > 0
        ? { $and: [congressQuery, filter] }
        : congressQuery;
      const results = await legislationCollection
        .find(mergedFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();
      return results.map(doc => {
        const { _id, ...rest } = doc;
        return rest as Legislation;
      });
    }

    // Default behavior for all other queries (non-congress)
    const legislationDocs = await legislationCollection
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();

    let results = legislationDocs.map(doc => {
      const { _id, ...rest } = doc;
      return rest as Legislation;
    });

    // Check if we should include Executive Orders
    // We include them if:
    // 1. classification filter is explicitly 'executive-order' OR
    // 2. classification filter is not set AND we are not filtering for a specific chamber/session that wouldn't apply
    const classificationFilter = filter.classification;
    const shouldFetchEOs =
      classificationFilter === 'executive-order' ||
      (!classificationFilter && !filter.chamber && !filter.session && !showCongress);

    if (shouldFetchEOs) {
      try {
        const eoCollection = await getCollection('executive_orders');

        // Build EO filter
        const eoFilter: Record<string, any> = {};

        // Apply search if present (from the logic above, 'filter' contains the finalized mongo query)
        // We need to try to extract the search regex if it exists in the input filter
        // The input 'filter' might have $and or other structures, so we do simpler matching here

        // If the caller passed a specific "classification" = "executive-order", we don't need to filter by it in EO collection
        // But if they passed other filters, we should try to respect them

        if (filter.jurisdictionName) {
          // EOs store state/jurisdiction as "state" field
          // Map "United States Congress" -> "United States" for EOs, though usually EOs are US or State
          if (filter.jurisdictionName === 'United States Congress') {
            eoFilter.state = 'United States';
          } else {
            eoFilter.state = filter.jurisdictionName;
          }
        }

        // Check for text search in the input filter
        // This is tricky because the input filter is already a constructed Mongo query
        // We'll peek at $or from the caller if it exists
        if (filter.$and) {
          const searchPart = filter.$and.find((f: any) => f.$or);
          if (searchPart) {
            // Reconstruct search for EO fields
            // We can't easily deep inspect the regex, so we'll skip complex reconstruction for now 
            // and rely on client-side or assume if getAllLegislationWithFiltering calls this, it handles merging.
            // However, getAllLegislation IS called by getAllLegislationWithFiltering with a constructed filter.

            // Strategy: If we recognize a search pattern in the filter, apply it to EO fields
            // For now, let's look for known fields in the filter that match EO equivalent

            // Actually, let's just use the same basic query structure if compatible.
            // EO fields: title, summary, topics (array), full_text, governor_or_president
          }
        }

        // Simplification: We will just fetch EOs and assume the caller (getAllLegislationWithFiltering) might handle complex merging, 
        // BUT getAllLegislationWithFiltering expects this function to do the db work.
        // We need to apply the same "search" logic if possible.

        // Let's manually check if there's a text search occurring.
        // In getAllLegislationWithFiltering, 'search' param generates an $or on title, summary, identifier, classification, subjects.

        // We can't easily verify the *original* search term here without changing the function signature.
        // However, we can fetch recent EOs and filter them in memory if the dataset is small, or just try to be smart.

        // BETTER APPROACH: match the filter structure for common fields
        if (filter.$and) {
          // It's likely a search query.
          // Let's try to extract the search regex from the title field if present
          const searchClause = filter.$and.find((f: any) => f.$or);
          if (searchClause) {
            const titleClause = searchClause.$or.find((c: any) => c.title);
            if (titleClause && titleClause.title.$regex) {
              const regex = titleClause.title.$regex;
              const options = titleClause.title.$options;

              eoFilter.$or = [
                { title: { $regex: regex, $options: options } },
                { summary: { $regex: regex, $options: options } },
                { topics: { $regex: regex, $options: options } },
                { governor_or_president: { $regex: regex, $options: options } }
              ];
            }
          }
        } else if (filter.$or) {
          // Direct search query?
          const titleClause = filter.$or.find((c: any) => c.title);
          if (titleClause && titleClause.title.$regex) {
            const regex = titleClause.title.$regex;
            const options = titleClause.title.$options;
            eoFilter.$or = [
              { title: { $regex: regex, $options: options } },
              { summary: { $regex: regex, $options: options } },
              { topics: { $regex: regex, $options: options } },
              { governor_or_president: { $regex: regex, $options: options } }
            ];
          }
        }

        // Apply sorting to EOs (map sort fields)
        let eoSort: Record<string, 1 | -1> = {};
        if (sort.latestActionAt || sort.createdAt || sort.updatedAt) {
          const dir = (sort.latestActionAt || sort.createdAt || sort.updatedAt) as 1 | -1;
          eoSort.date_signed = dir;
        } else {
          eoSort = { date_signed: -1 };
        }

        const eoDocs = await eoCollection
          .find(eoFilter)
          .sort(eoSort)
          .limit(limit) // Fetch up to limit, we'll slice later after merge
          .toArray();

        const eoLegislation: Legislation[] = eoDocs.map(eo => ({
          id: eo.id,
          title: eo.title,
          identifier: eo.number ? (eo.state === 'United States' ? `EO ${eo.number}` : `Exec. Order ${eo.number}`) : 'Executive Order',
          jurisdictionName: eo.state,
          classification: ['executive-order'],
          session: new Date(eo.date_signed).getFullYear().toString(),
          statusText: 'Signed',
          summary: eo.geminiSummary || eo.summary,
          createdAt: eo.createdAt,
          updatedAt: eo.updatedAt || eo.createdAt,
          // Map Signing Date to action dates
          firstActionAt: eo.date_signed,
          latestActionAt: eo.date_signed,
          latestPassageAt: eo.date_signed,
          enactedAt: eo.date_signed,
          latestActionDescription: `Signed by ${eo.governor_or_president}`,
          // Map Governor/President to sponsors
          sponsors: [{ name: eo.governor_or_president, role: 'Executive' }],
          subjects: eo.topics || [],
          sources: [{ url: eo.full_text_url, note: 'Official Source' }],
          stateLegislatureUrl: eo.full_text_url
        }));

        // Merge and Sort
        results = [...results, ...eoLegislation];

        // Re-sort combined results
        results.sort((a, b) => {
          const dateA = a.latestActionAt ? new Date(a.latestActionAt).getTime() : 0;
          const dateB = b.latestActionAt ? new Date(b.latestActionAt).getTime() : 0;
          // Assuming sort is primarily by date descending for the feed
          const direction = (sort.latestActionAt === 1 || sort.createdAt === 1 || sort.updatedAt === 1) ? 1 : -1;
          return direction * (dateA - dateB);
        });

        // Re-apply skip/limit on merged set
        // Note: This isn't perfect pagination because we fetched (skip+limit) from both sources conceptually, 
        // but here we only fetched 'limit' from each. 
        // For strict pagination, we'd need to fetch skip+limit from both and slice, which is heavier.
        // Given we are mostly browsing recent items, this simple merge is usually acceptable for a combined feed.
        // A better approach for deep pagination would be to fetch more or use weighted merging, 
        // but exact pagination across two separate collections is hard without aggregation.

        // If we are strictly skipping, we might lose EOs if we didn't fetch enough. 
        // We'll stick to slicing the combined result for now.
        if (results.length > limit) {
          results = results.slice(0, limit);
        }

      } catch (err) {
        console.error('Error fetching executive orders:', err);
        // Do not fail the whole request if EOs fail, just return legislation
      }
    }

    return results;
  } catch (error) {
    console.error('Error fetching all legislation from service: ', error);
    throw new Error('Failed to fetch legislation.');
  }
}

export async function testLegislationCollectionService(): Promise<void> {
  try {
    const collection = await getCollection('legislation');
    const count = await collection.countDocuments();
    console.log(`[Service] Legislation collection has ${count} documents.`);
    const oneDoc = await collection.findOne();
    if (oneDoc) {
      console.log('[Service] Sample document:', oneDoc);
    } else {
      console.log('[Service] No documents found in legislation collection.');
    }
  } catch (error) {
    console.error('[Service] Failed to connect to legislation collection:', error);
  }
}

/**
 * @deprecated This function is deprecated. Use getAllLegislation with search filters instead.
 * 
 * Migration guide:
 * OLD: await searchLegislationByTopic(topic, daysBack)
 * NEW: await fetch(`/api/legislation?search=${encodeURIComponent(topic)}&limit=100&sortBy=latestActionAt&sortDir=desc`)
 * 
 * Or directly in code:
 * await getAllLegislation({
 *   limit: 100,
 *   sort: { latestActionAt: -1, updatedAt: -1 },
 *   filter: {
 *     $or: [
 *       { title: { $regex: topic, $options: 'i' } },
 *       { summary: { $regex: topic, $options: 'i' } },
 *       { subjects: { $regex: topic, $options: 'i' } }
 *     ]
 *   }
 * })
 * 
 * This function will be removed in a future version.
 */
// Overload for backward compatibility
export async function searchLegislationByTopic(topic: string, daysBack: number): Promise<Legislation[]>;
export async function searchLegislationByTopic(
  topic: string,
  options: {
    daysBack?: number;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    filters?: Record<string, any>;
    showCongress?: boolean;
  }
): Promise<Legislation[]>;
export async function searchLegislationByTopic(
  topic: string,
  optionsOrDaysBack: number | {
    daysBack?: number;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    filters?: Record<string, any>;
    showCongress?: boolean;
  } = {}
): Promise<Legislation[]> {
  try {
    // Handle both old signature (topic, daysBack) and new signature (topic, options)
    let options: {
      daysBack?: number;
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
      filters?: Record<string, any>;
      showCongress?: boolean;
    };

    if (typeof optionsOrDaysBack === 'number') {
      options = { daysBack: optionsOrDaysBack };
    } else {
      options = optionsOrDaysBack || {};
    }

    const {
      daysBack = 7,
      limit = 100,
      skip = 0,
      sort = { latestActionAt: -1, updatedAt: -1 },
      filters = {},
      showCongress = false
    } = options;

    // Extract location keywords from the topic (state names, cities, etc.)
    const locationKeywords = [
      'ohio', 'california', 'texas', 'florida', 'new york', 'pennsylvania',
      'illinois', 'georgia', 'north carolina', 'michigan', 'new jersey',
      'virginia', 'washington', 'arizona', 'massachusetts', 'tennessee',
      'indiana', 'maryland', 'missouri', 'wisconsin', 'colorado',
      'minnesota', 'south carolina', 'alabama', 'louisiana', 'kentucky',
      'oregon', 'oklahoma', 'connecticut', 'utah', 'iowa', 'nevada',
      'arkansas', 'mississippi', 'kansas', 'new mexico', 'nebraska',
      'west virginia', 'idaho', 'hawaii', 'new hampshire', 'maine',
      'montana', 'rhode island', 'delaware', 'south dakota', 'north dakota',
      'alaska', 'vermont', 'wyoming'
    ];
    // Add federal keywords
    const federalKeywords = [
      'congress', 'united states congress', 'us congress', 'federal', 'national',
      'house of representatives', 'senate', 'capitol hill', 'washington dc', 'dc congress'
    ];

    const topicLower = topic.toLowerCase();
    const detectedStates = locationKeywords.filter(state => topicLower.includes(state));
    const detectedFederal = federalKeywords.filter(fed => topicLower.includes(fed));

    // Create search terms from the topic (excluding location and federal words for content search)
    const searchTerms = topic.toLowerCase()
      .split(' ')
      .filter(term => term.length > 2 && !locationKeywords.includes(term) && !federalKeywords.includes(term))
      .filter(term => !['in', 'of', 'the', 'and', 'or', 'laws', 'law', 'bill', 'bills'].includes(term));

    // Build base filters from options
    let otherFilters = { ...filters };

    // Auto-detect Congress vs State filtering if not explicitly set
    if (showCongress || detectedFederal.length > 0) {
      otherFilters.jurisdictionName = 'United States Congress';
    } else if (detectedStates.length > 0) {
      const statePatterns = detectedStates.map(state => new RegExp(state, 'i'));
      otherFilters.jurisdictionName = { $in: statePatterns };
    }

    // Full text search using the same approach as main legislation endpoint
    const searchValue = topic.trim();
    let finalFilter = { ...otherFilters };

    if (searchValue) {
      const searchOr = [
        { title: { $regex: searchValue, $options: 'i' } },
        { summary: { $regex: searchValue, $options: 'i' } },
        { identifier: { $regex: searchValue, $options: 'i' } },
        { classification: searchValue },
        { classification: { $regex: searchValue, $options: 'i' } },
        { subjects: searchValue },
        { subjects: { $regex: searchValue, $options: 'i' } },
        { geminiSummary: { $regex: searchValue, $options: 'i' } },
        { latestActionDescription: { $regex: searchValue, $options: 'i' } }
      ];
      // If there are other filters, combine with $and
      const filtersWithoutOr = { ...otherFilters };
      delete filtersWithoutOr.$or;
      finalFilter = { $and: [filtersWithoutOr, { $or: searchOr }] };
    }

    // Get legislation using the improved search approach
    let legislations = await getAllLegislation({
      limit,
      skip,
      sort,
      filter: finalFilter,
      showCongress: showCongress || detectedFederal.length > 0
    });

    // Fuzzy search fallback: only if no results and a search term is present
    if (searchValue && legislations.length === 0) {
      console.log('[Topic Search] No exact matches found, trying fuzzy search...');

      // Strictly apply all non-search filters (deep copy, excluding $or)
      const fuzzyFilter: Record<string, any> = JSON.parse(JSON.stringify(otherFilters));
      if (fuzzyFilter.$or) delete fuzzyFilter.$or;

      // Get all candidates that match the non-search filters
      const allCandidates = await getAllLegislation({
        limit: 500, // Get more candidates for fuzzy matching
        skip: 0,
        sort,
        filter: fuzzyFilter,
        showCongress: showCongress || detectedFederal.length > 0
      });

      if (allCandidates.length > 0) {
        const Fuse = (await import('fuse.js')).default;

        // Only use the same fields as regular full text search
        const fuseKeys = [
          "title",
          "summary",
          "identifier",
          "classification",
          "subjects",
          "geminiSummary",
          "latestActionDescription"
        ];

        const normalizedCandidates = allCandidates.map((u: any, idx: number) => ({
          idx,
          title: u.title ? String(u.title).toLowerCase().trim() : '',
          summary: u.summary ? String(u.summary).toLowerCase().trim() : '',
          identifier: u.identifier ? String(u.identifier).toLowerCase().trim() : '',
          classification: Array.isArray(u.classification) ? u.classification.map((v: any) => String(v).toLowerCase().trim()) : [],
          subjects: Array.isArray(u.subjects) ? u.subjects.map((v: any) => String(v).toLowerCase().trim()) : [],
          geminiSummary: u.geminiSummary ? String(u.geminiSummary).toLowerCase().trim() : '',
          latestActionDescription: u.latestActionDescription ? String(u.latestActionDescription).toLowerCase().trim() : '',
        }));

        const fuse = new Fuse(normalizedCandidates, {
          keys: fuseKeys,
          threshold: 0.4,
          ignoreLocation: true,
          includeScore: true,
          findAllMatches: true,
          minMatchCharLength: 2,
        });

        const fuzzyResults = fuse.search(searchValue.trim().toLowerCase()).map(r => r.item.idx);
        legislations = fuzzyResults.map(idx => allCandidates[idx]).slice(0, limit);

        console.log(`[Topic Search] Fuzzy search found ${legislations.length} results`);
      }
    }

    console.log(`[Topic Search] Final results: ${legislations.length} for topic: "${topic}"`);
    return legislations;
  } catch (error) {
    console.error('Error searching legislation by topic:', error);
    return [];
  }
}

export async function updateLegislation(id: string, updateData: Partial<Legislation>): Promise<Legislation | null> {
  if (!id) {
    console.error('ID is required to update legislation.');
    return null;
  }
  try {
    const { id: _, ...dataToUpdate } = updateData;
    let cleanedData = cleanupDataForMongoDB(dataToUpdate);
    cleanedData.updatedAt = new Date();

    if (cleanedData.firstActionAt) {
      cleanedData.firstActionAt = new Date(cleanedData.firstActionAt);
    }
    if (cleanedData.latestActionAt) {
      cleanedData.latestActionAt = new Date(cleanedData.latestActionAt);
    }
    if (cleanedData.latestPassageAt) {
      cleanedData.latestPassageAt = new Date(cleanedData.latestPassageAt);
    }

    const legislationCollection = await getCollection('legislation');
    const result = await legislationCollection.updateOne(
      { id },
      { $set: cleanedData }
    );

    if (result.matchedCount === 0) {
      return null;
    }

    // Return the updated document
    const updatedDoc = await legislationCollection.findOne({ id });
    if (updatedDoc) {
      const { _id, ...restOfDoc } = updatedDoc;
      return restOfDoc as Legislation;
    }
    return null;
  } catch (error) {
    console.error(`Error updating legislation document with id ${id}: `, error);
    throw new Error('Failed to update legislation.');
  }
}

export async function deleteLegislation(id: string): Promise<boolean> {
  if (!id) {
    console.error('ID is required to delete legislation.');
    return false;
  }
  try {
    const legislationCollection = await getCollection('legislation');
    const result = await legislationCollection.deleteOne({ id });
    return result.deletedCount > 0;
  } catch (error) {
    console.error(`Error deleting legislation document with id ${id}: `, error);
    throw new Error('Failed to delete legislation.');
  }
}

