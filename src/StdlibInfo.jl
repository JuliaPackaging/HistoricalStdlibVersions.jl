# NOTE: This file is also included by `ext/HistorialStdlibGenerator/generate_historical_stdlibs.jl`
using Pkg

import Base: UUID

# Use the `Pkg` `StdlibInfo` type if it exists, otherwise just re-define it
if !isdefined(Pkg.Types, :StdlibInfo)
struct StdlibInfo
    name::String
    uuid::UUID

    # This can be `nothing` if it's an unregistered stdlib
    version::Union{Nothing,VersionNumber}

    deps::Vector{UUID}
    weakdeps::Vector{UUID}
end
else
import Pkg.Types: StdlibInfo
end

# `version_map.jl` records each Julia release as the stdlibs that changed since the previous
# release, with deps given by name. A change is one of
#   "Name" => (version, deps[, weakdeps])   new stdlib, or its deps changed
#   "Name" => v"x.y.z"                      only the version changed
#   "Name" => nothing                       stdlib removed
function apply_stdlib_changes!(stdlibs::Dict{UUID,StdlibInfo}, uuids::Dict{String,UUID}, changes)
    dep_uuids(names) = sort!(UUID[uuids[name] for name in names])
    for (name, change) in changes
        uuid = uuids[name]
        if change === nothing
            delete!(stdlibs, uuid)
        elseif change isa VersionNumber
            old = stdlibs[uuid]
            stdlibs[uuid] = StdlibInfo(name, uuid, change, old.deps, old.weakdeps)
        else
            version, deps, weakdeps = length(change) == 2 ? (change..., String[]) : change
            stdlibs[uuid] = StdlibInfo(name, uuid, version, dep_uuids(deps), dep_uuids(weakdeps))
        end
    end
    return stdlibs
end

function decode_stdlibs_by_version(uuids::Dict{String,UUID}, changes_by_version)
    result = Pair{VersionNumber,Dict{UUID,StdlibInfo}}[]
    stdlibs = Dict{UUID,StdlibInfo}()
    for (julia_version, changes) in changes_by_version
        stdlibs = apply_stdlib_changes!(copy(stdlibs), uuids, changes)
        push!(result, julia_version => stdlibs)
    end
    return result
end
