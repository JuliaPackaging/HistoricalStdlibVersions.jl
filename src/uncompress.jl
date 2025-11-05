
# Build STDLIBS_BY_UUID from segments
function _build_stdlibs_by_uuid()
    result = Dict{UUID, Vector{Pair{Tuple{VersionNumber,VersionNumber}, StdlibInfo}}}()

    for (uuid, segments) in STDLIB_SEGMENTS
        result[uuid] = []
        for segment in segments
            for (range, ver) in segment.version_ranges
                push!(result[uuid], range => StdlibInfo(
                    segment.base_info.name,
                    segment.base_info.uuid,
                    ver,
                    segment.base_info.deps,
                    segment.base_info.weakdeps,
                ))
            end
        end
    end

    return result
end

const STDLIBS_BY_UUID = _build_stdlibs_by_uuid()

# Convert to version-indexed format for Pkg
function _build_stdlibs_by_version()
    all_versions = Set{VersionNumber}()
    for ranges in values(STDLIBS_BY_UUID)
        for ((start_v, end_v), _) in ranges
            push!(all_versions, start_v)
            push!(all_versions, end_v)
        end
    end

    result = Pair{VersionNumber, Dict{UUID,StdlibInfo}}[]
    for version in sort(collect(all_versions))
        stdlib_dict = Dict{UUID,StdlibInfo}()
        for (uuid, ranges) in STDLIBS_BY_UUID
            for ((start_v, end_v), info) in ranges
                if start_v <= version <= end_v
                    stdlib_dict[uuid] = info
                    break
                end
            end
        end
        if !isempty(stdlib_dict)
            push!(result, version => stdlib_dict)
        end
    end
    return result
end

const STDLIBS_BY_VERSION = _build_stdlibs_by_version()
