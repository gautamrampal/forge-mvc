<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
  <h4 class="mb-0">__Name__s</h4>
  <a href="/__kebab__/create" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>New __Name__</a>
</div>

<!-- GET so results stay linkable and the back button works; no CSRF needed, it changes nothing.
     Add `static searchable = ['name']` to the model to make this do something. -->
<form method="GET" action="/__kebab__" class="row g-2 mb-3">
  <div class="col-12 col-sm-5 col-md-4">
    <input type="search" name="q" class="form-control form-control-sm"
           placeholder="Search…" value="<%= typeof q !== 'undefined' ? q : '' %>">
  </div>
  <div class="col-auto">
    <button type="submit" class="btn btn-sm btn-outline-primary">Search</button>
  </div>
  <% if (typeof q !== 'undefined' && q) { %>
    <div class="col-auto"><a href="/__kebab__" class="btn btn-sm btn-outline-secondary">Clear</a></div>
  <% } %>
</form>

<% if (!rows.length) { %>
  <div class="card"><div class="card-body text-center text-muted py-5">
    <% if (typeof q !== 'undefined' && q) { %>
      <p>No __Name__s match your search.</p>
      <a href="/__kebab__" class="btn btn-outline-secondary btn-sm">Clear search</a>
    <% } else { %>
      <p>No __Name__s yet.</p>
      <a href="/__kebab__/create" class="btn btn-primary btn-sm">Create your first __Name__</a>
    <% } %>
  </div></div>
<% } else { %>
<div class="card">
  <div class="table-responsive">
    <table class="table table-hover mb-0 align-middle">
      <thead class="table-light"><tr><th>ID</th><th>Created</th><th></th></tr></thead>
      <tbody>
        <% rows.forEach(function(record){ %>
          <tr>
            <td><a href="/__kebab__/<%= record.id %>">#<%= record.id %></a></td>
            <td class="small text-muted"><%= record.created_at %></td>
            <td class="text-end">
              <a href="/__kebab__/<%= record.id %>/edit" class="btn btn-sm btn-outline-secondary">Edit</a>
            </td>
          </tr>
        <% }); %>
      </tbody>
    </table>
  </div>
</div>
<p class="text-muted small mt-2">Page <%= page %> of <%= totalPages %> (<%= total %> total)</p>
<% } %>
