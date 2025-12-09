# Compression functions for stdlib version data

# Analyze UUID usage for constants
function analyze_uuid_usage(stdlibs_by_version)
    uuid_counts = Dict{UUID, Int}()
    uuid_to_name = Dict{UUID, String}()

    for (_, stdlib_dict) in stdlibs_by_version
        for (uuid, info) in stdlib_dict
            uuid_counts[uuid] = get(uuid_counts, uuid, 0) + 1
            uuid_to_name[uuid] = info.name

            for dep_uuid in info.deps
                uuid_counts[dep_uuid] = get(uuid_counts, dep_uuid, 0) + 1
            end

            for weakdep_uuid in info.weakdeps
                uuid_counts[weakdep_uuid] = get(uuid_counts, weakdep_uuid, 0) + 1
            end
        end
    end

    return uuid_counts, uuid_to_name
end

# Group by UUID
function group_by_uuid(stdlibs_by_version)
    uuid_to_versions = Dict{UUID, Vector{Tuple{VersionNumber, StdlibInfo}}}()

    for (version, stdlib_dict) in stdlibs_by_version
        for (uuid, info) in stdlib_dict
            if !haskey(uuid_to_versions, uuid)
                uuid_to_versions[uuid] = []
            end
            push!(uuid_to_versions[uuid], (version, info))
        end
    end

    for (uuid, versions) in uuid_to_versions
        sort!(versions, by=x->x[1])
    end

    return uuid_to_versions
end

# Compare base info (everything except version)
function base_info_equal(a::StdlibInfo, b::StdlibInfo)
    a.name == b.name &&
    a.uuid == b.uuid &&
    a.deps == b.deps &&
    a.weakdeps == b.weakdeps
end

# Find segments where base info is constant
function find_base_info_segments(versions_and_infos)
    segments = []
    i = 1

    while i <= length(versions_and_infos)
        segment_start_idx = i
        segment_base_info = versions_and_infos[i][2]
        j = i + 1

        # Find consecutive entries with same base info
        while j <= length(versions_and_infos)
            if base_info_equal(versions_and_infos[j][2], segment_base_info)
                j += 1
            else
                break
            end
        end

        segment_end_idx = j - 1
        segment_entries = versions_and_infos[segment_start_idx:segment_end_idx]

        # Within this segment, find version ranges based on package version
        version_ranges = []
        k = 1
        while k <= length(segment_entries)
            range_start_version = segment_entries[k][1]
            current_pkg_version = segment_entries[k][2].version
            m = k + 1

            while m <= length(segment_entries)
                if segment_entries[m][2].version == current_pkg_version
                    m += 1
                else
                    break
                end
            end

            range_end_version = segment_entries[m-1][1]
            push!(version_ranges, ((range_start_version, range_end_version), current_pkg_version))
            k = m
        end

        push!(segments, (segment_base_info, version_ranges))
        i = j
    end

    return segments
end

# Analyze stdlib patterns with segmentation
function analyze_stdlib_patterns(uuid_to_versions)
    uuid_to_segments = Dict{UUID, Vector}()

    for (uuid, versions_and_infos) in uuid_to_versions
        segments = find_base_info_segments(versions_and_infos)
        uuid_to_segments[uuid] = segments
    end

    return uuid_to_segments
end

# Format UUID reference
function format_uuid(uuid, uuid_constants)
    get(uuid_constants, uuid, "UUID(\"$(uuid)\")")
end

# Format base info struct
function format_base_info(info, uuid_constants)
    # Build keyword arguments, omitting defaults
    parts = ["name = \"$(info.name)\"", "uuid = $(format_uuid(info.uuid, uuid_constants))"]

    if !isempty(info.deps)
        deps_str = "UUID[" * join([format_uuid(d, uuid_constants) for d in sort(info.deps)], ", ") * "]"
        push!(parts, "deps = $(deps_str)")
    end

    if !isempty(info.weakdeps)
        weakdeps_str = "UUID[" * join([format_uuid(d, uuid_constants) for d in sort(info.weakdeps)], ", ") * "]"
        push!(parts, "weakdeps = $(weakdeps_str)")
    end

    args_str = join(parts, ", ")
    return "StdlibBaseInfo($(args_str))"
end

# Write compressed version map to file
function write_compressed_version_map(output_fname, stdlibs_by_version, unregistered_stdlibs)
    # Analyze and prepare compression
    @info("Analyzing version map for compression...")
    uuid_counts, uuid_to_name = analyze_uuid_usage(stdlibs_by_version)

    # Define constants for frequently used UUIDs
    const_threshold = 5
    uuid_constants = Dict{UUID, String}()

    for (uuid, count) in uuid_counts
        if count >= const_threshold && haskey(uuid_to_name, uuid)
            name = uuid_to_name[uuid]
            const_name = "$(name)_uuid"
            const_name = replace(const_name, r"[^a-zA-Z0-9_]" => "_")
            uuid_constants[uuid] = const_name
        end
    end

    uuid_to_versions = group_by_uuid(stdlibs_by_version)
    uuid_to_segments = analyze_stdlib_patterns(uuid_to_versions)

    # Output compressed version map
    @info("Outputting compressed version map to $(output_fname)")
    open(output_fname, "w") do io
        println(io, "## This file autogenerated by ext/HistoricalStdlibGenerator/generate_historical_stdlibs.jl")
        println(io)
        println(io, "# Julia standard libraries with segment-based compression:")
        println(io, "# - Each stdlib split into segments where base info (name, uuid, deps, weakdeps) is constant")
        println(io, "# - Within each segment, only package version numbers stored per Julia version range")
        println(io)

        # Write UUID constants
        if !isempty(uuid_constants)
            println(io, "# UUID constants")
            for (uuid, const_name) in sort(collect(uuid_constants), by=x->x[2])
                println(io, "const $(const_name) = UUID(\"$(uuid)\")")
            end
            println(io)
        end

        # Write stdlib info with segments
        println(io, "# Format: UUID => [StdlibSegment(...), ...]")
        println(io, "const STDLIB_SEGMENTS = Dict{UUID, Vector{StdlibSegment}}(")

        sorted_uuids = sort(collect(keys(uuid_to_segments)), by=u->uuid_to_name[u])

        for (idx, uuid) in enumerate(sorted_uuids)
            segments = uuid_to_segments[uuid]
            uuid_str = format_uuid(uuid, uuid_constants)

            println(io, "    $(uuid_str) => [")

            for (seg_idx, (base_info, version_ranges)) in enumerate(segments)
                println(io, "        StdlibSegment(")
                println(io, "            base_info = ", format_base_info(base_info, uuid_constants), ",")
                println(io, "            version_ranges = [")

                for (range_idx, ((start_v, end_v), ver)) in enumerate(version_ranges)
                    ver_str = isnothing(ver) ? "nothing" : "v\"$(ver)\""
                    comma = range_idx < length(version_ranges) ? "," : ""
                    if start_v == end_v
                        println(io, "                (v\"$(start_v)\", v\"$(start_v)\") => $(ver_str)$(comma)")
                    else
                        println(io, "                (v\"$(start_v)\", v\"$(end_v)\") => $(ver_str)$(comma)")
                    end
                end

                print(io, "            ],")
                println(io)
                print(io, "        )")
                println(io, seg_idx < length(segments) ? "," : "")
            end

            print(io, "    ]")
            println(io, idx < length(sorted_uuids) ? "," : "")
        end

        println(io, ")")
        println(io)

        # Write UNREGISTERED_STDLIBS
        print(io, """
    # Next, we also embed a list of stdlibs that must _always_ be treated as stdlibs,
    # because they cannot be resolved in the registry; they have only ever existed within
    # the Julia stdlib source tree, and because of that, trying to resolve them will fail.
    """)
        println(io, "const UNREGISTERED_STDLIBS = Dict{UUID,StdlibInfo}(")
        for (idx, (uuid, info)) in enumerate(sort(collect(unregistered_stdlibs), by=x->x[2].name))
            uuid_str = format_uuid(uuid, uuid_constants)
            deps_str = isempty(info.deps) ? "UUID[]" : "UUID[" * join([format_uuid(d, uuid_constants) for d in sort(info.deps)], ", ") * "]"
            weakdeps_str = isempty(info.weakdeps) ? "UUID[]" : "UUID[" * join([format_uuid(d, uuid_constants) for d in sort(info.weakdeps)], ", ") * "]"
            ver_str = isnothing(info.version) ? "nothing" : "v\"$(info.version)\""

            println(io, "    $(uuid_str) => StdlibInfo(")
            println(io, "        \"$(info.name)\",")
            println(io, "        $(uuid_str),")
            println(io, "        $(ver_str),")
            println(io, "        $(deps_str),")
            println(io, "        $(weakdeps_str),")
            println(io, "    )", idx < length(unregistered_stdlibs) ? "," : "")
        end
        println(io, ")")
    end
end
